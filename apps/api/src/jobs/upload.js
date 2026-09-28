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

// Streams multipart files straight to temporary storage. `names` are the accepted file fields; at least one
// of them must be present. Resolves { fields, files: { [name]: { key, fileName, size } } }.
function receiveFiles(request, { storage, maxFileSizeBytes, names = ['file'] }) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers: request.headers, limits: { fileSize: maxFileSizeBytes, files: names.length, fields: 5, fieldSize: 1024 } });
    } catch {
      reject(new HttpError(400, 'INVALID_UPLOAD', 'La solicitud debe enviarse como multipart/form-data.'));
      return;
    }

    const fields = {};
    const files = {};
    const pending = [];
    let failure = null;

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, stream, info) => {
      if (!names.includes(name) || files[name]) {
        stream.resume();
        return;
      }
      const fileName = String(info.filename || '').slice(0, 255);
      if (!XLSX_EXTENSION.test(fileName)) {
        failure = new HttpError(415, 'UNSUPPORTED_FILE', 'El archivo debe ser un Excel .xlsx. Los libros con macros (.xlsm) no se aceptan.');
        stream.resume();
        return;
      }

      const upload = { fileName, size: 0 };
      files[name] = upload;
      pending.push(storage.reserve({ extension: 'xlsx' }).then(({ key, path }) => new Promise((done, fail) => {
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
      })));
    });

    busboy.on('error', () => reject(new HttpError(400, 'INVALID_UPLOAD', 'No pudimos leer el archivo enviado.')));

    busboy.on('close', async () => {
      const uploads = () => Object.values(files).filter((upload) => upload.key);
      try {
        await Promise.all(pending);
        if (!failure && !Object.keys(files).length) failure = new HttpError(400, 'FILE_REQUIRED', 'Adjunta un archivo .xlsx.');
        for (const upload of Object.values(files)) {
          if (failure) break;
          if (upload.size === 0) failure = new HttpError(400, 'EMPTY_FILE', `El archivo «${upload.fileName}» está vacío.`);
          else if (!(await hasZipSignature(storage.resolvePath(upload.key)))) failure = new HttpError(415, 'UNSUPPORTED_FILE', `«${upload.fileName}» no es un Excel .xlsx válido.`);
        }
        if (failure) {
          await Promise.all(uploads().map((upload) => storage.delete(upload.key)));
          reject(failure);
          return;
        }
        resolve({ fields, files });
      } catch (error) {
        await Promise.all(uploads().map((upload) => storage.delete(upload.key).catch(() => {})));
        reject(error);
      }
    });

    request.pipe(busboy);
  });
}

async function receiveUpload(request, options) {
  const { fields, files } = await receiveFiles(request, { ...options, names: ['file'] });
  return { fields, file: files.file };
}

module.exports = { receiveFiles, receiveUpload };
