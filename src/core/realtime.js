let io = null;

export async function attachRealtime(server) {
  try {
    const socketModule = await import('socket.io');
    const { Server } = socketModule;

    io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    io.on('connection', (socket) => {
      socket.emit('dashboard:connected', { ok: true });
    });

    console.log('Socket.io activo');
  } catch {
    console.log('Socket.io no instalado; dashboard usara actualizacion por sondeo');
  }
}

export function emitDashboardEvent(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}
