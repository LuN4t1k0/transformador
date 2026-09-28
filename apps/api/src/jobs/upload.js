const fs = require('node:fs');
const fsp = require('node:fs/promises');
const Busboy = require('busboy');
const { HttpError } = require('../http');

const XLSX_EXTENSION = /\.xlsx$/i;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

async function hasZipSignature(filePath) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    await handle.read(buffer, 0, 4, 0);
    return buffer.equals(ZIP_MAGIC);
  } finally {
    await handle.close();
  }
}

// Streams a multipart upload straight to temporary storage. Resolves { fields, file: { key, fileName, size } }.
function receiveUpload(request, { storage, maxFileSizeBytes }) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers: request.headers, limits: { fileSize: maxFileSizeBytes, files: 1, fields: 5, fieldSize: 1024 } });
    } catch {
      reject(new HttpError(400, 'INVALID_UPLOAD', 'La solicitud debe enviarse como multipart/form-data.'));
      return;
    }

    const fields = {};
    let upload = null;
    let failure = null;
    let pending = Promise.resolve();

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, stream, info) => {
      if (name !== 'file' || upload) {
        stream.resume();
        return;
      }
      const fileName = String(info.filename || '').slice(0, 255);
      if (!XLSX_EXTENSION.test(fileName)) {
        failure = new HttpError(415, 'UNSUPPORTED_FILE', 'El archivo debe ser un Excel .xlsx. Los libros con macros (.xlsm) no se aceptan.');
        stream.resume();
        return;
      }

      upload = { fileName, size: 0 };
      pending = storage.reserve({ extension: 'xlsx' }).then(({ key, path }) => new Promise((done, fail) => {
        upload.key = key;
        const target = fs.createWriteStream(path, { mode: 0o600 });
        stream.on('data', (chunk) => {
          upload.size += chunk.length;
        });
        stream.on('limit', () => {
          failure = new HttpError(413, 'FILE_TOO_LARGE', `El archivo supera el máximo de ${Math.round(maxFileSizeBytes / (1024 * 1024))} MB.`);
        });
        target.on('finish', done);
        target.on('error', fail);
        stream.pipe(target);
      }));
    });

    busboy.on('error', () => reject(new HttpError(400, 'INVALID_UPLOAD', 'No pudimos leer el archivo enviado.')));

    busboy.on('close', async () => {
      try {
        await pending;
        if (!failure && !upload) failure = new HttpError(400, 'FILE_REQUIRED', 'Adjunta un archivo .xlsx.');
        if (!failure && upload.size === 0) failure = new HttpError(400, 'EMPTY_FILE', 'El archivo está vacío.');
        if (!failure && !(await hasZipSignature(storage.resolvePath(upload.key)))) {
          failure = new HttpError(415, 'UNSUPPORTED_FILE', 'El archivo no es un Excel .xlsx válido.');
        }
        if (failure) {
          if (upload?.key) await storage.delete(upload.key);
          reject(failure);
          return;
        }
        resolve({ fields, file: upload });
      } catch (error) {
        if (upload?.key) await storage.delete(upload.key).catch(() => {});
        reject(error);
      }
    });

    request.pipe(busboy);
  });
}

module.exports = { receiveUpload };
