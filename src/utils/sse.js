// Módulo SSE (Server-Sent Events) para notificaciones en tiempo real

const clients = new Set();

export function addClient(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // Enviar comentario inicial para confirmar conexión
    res.write(':connected\n\n');

    clients.add(res);

    // Heartbeat cada 30s para mantener la conexión viva
    const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
    }, 30000);

    res.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
    });
}

export function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
        client.write(payload);
    }
}
