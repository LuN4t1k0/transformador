const { Server } = require('socket.io');
const { JOB_EVENTS_CHANNEL } = require('../../../../packages/queue/src');
const { JOB_EVENTS, jobRoom } = require('./job-events');

const KNOWN_EVENTS = new Set(Object.values(JOB_EVENTS));

// Relays worker/API events from Redis to Socket.IO rooms. Each event carries the full job metadata
// (reloaded from PostgreSQL) so clients can rehydrate from any single event.
function attachRealtime(httpServer, { authenticate, jobService, jobs, subscriber, allowedOrigin, log }) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigin, credentials: true },
    serveClient: false
  });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await authenticate(socket.handshake.headers);
      next();
    } catch (error) {
      next(Object.assign(new Error(error.message), { data: { code: error.code || 'UNAUTHENTICATED' } }));
    }
  });

  io.on('connection', (socket) => {
    // Rooms are joined only after checking that the user owns the job.
    socket.on('job:subscribe', async (jobId, ack = () => {}) => {
      try {
        const job = await jobService.get(String(jobId), socket.data.user);
        await socket.join(jobRoom(job.id));
        ack({ ok: true, job });
      } catch (error) {
        ack({ ok: false, error: { code: error.code || 'ERROR', message: error.message } });
      }
    });

    socket.on('job:unsubscribe', (jobId) => socket.leave(jobRoom(String(jobId))));
  });

  subscriber.subscribe(JOB_EVENTS_CHANNEL);
  subscriber.on('message', async (channel, message) => {
    if (channel !== JOB_EVENTS_CHANNEL) return;
    try {
      const { jobId, type } = JSON.parse(message);
      if (!KNOWN_EVENTS.has(type)) return;
      const room = jobRoom(jobId);
      if (!io.sockets.adapter.rooms.has(room)) return;
      const job = await jobs.get(jobId);
      if (job) io.to(room).emit(type, { type, job: await jobService.view(job) });
    } catch (error) {
      log({ event: 'realtime:error', message: error.message });
    }
  });

  return io;
}

module.exports = { attachRealtime };
