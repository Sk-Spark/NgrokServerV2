import express, { Request, Response, RequestHandler } from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import { IncomingMessage } from 'http';

interface TunnelClient extends WebSocket {
    clientId?: string;
    isRaspberryPi?: boolean;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map<string, TunnelClient>();
const tunnels = new Map<string, { pi: TunnelClient; browser: TunnelClient }>();

// Add a route to list all active tunnels
app.get('/tunnels', (req, res) => {
    const activeTunnels = Array.from(tunnels.entries()).map(([id, tunnel]) => ({
        id,
        isActive: true,
        hasConnectedBrowser: !!tunnel.browser
    }));
    
    res.json({
        activeTunnels,
        totalTunnels: tunnels.size,
        totalClients: clients.size
    });
});

// Add HTTP route handling for tunnel requests
const handleTunnelRequest: RequestHandler = async (req, res) => {
    const tunnelId = req.params.tunnelId;
    const tunnel = tunnels.get(tunnelId);
    
    if (!tunnel || !tunnel.pi) {
        res.status(404).send('Tunnel not found or inactive');
        return;
    }

    // Create a promise to handle the response
    const responsePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 30000); // 30 second timeout

        // Send the request to the Raspberry Pi
        tunnel.pi.send(JSON.stringify({
            type: 'data',
            payload: {
                method: req.method,
                path: req.path.replace(`/tunnel/${tunnelId}`, ''),
                headers: req.headers,
                body: req.body
            }
        }));

        // Handle the response from Raspberry Pi
        const messageHandler = (message: string) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'data') {
                    clearTimeout(timeout);
                    resolve(data.payload);
                }
            } catch (error) {
                reject(error);
            }
        };

        tunnel.pi.on('message', messageHandler);
    });

    try {
        const response = await responsePromise;
        res.send(response);
    } catch (error) {
        res.status(500).send('Error processing request');
    }
};

// Add route for the root tunnel URL
const handleRootTunnel: RequestHandler = (req, res) => {
    const tunnelId = req.params.tunnelId;
    const tunnel = tunnels.get(tunnelId);
    
    if (!tunnel || !tunnel.pi) {
        res.status(404).send('Tunnel not found or inactive');
        return;
    }
    
    // Forward the request to the root path
    tunnel.pi.send(JSON.stringify({
        type: 'data',
        payload: {
            method: 'GET',
            path: '/',
            headers: req.headers
        }
    }));

    // Handle the response
    const messageHandler = (message: string) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'data') {
                res.send(data.payload);
                tunnel.pi.removeListener('message', messageHandler);
            }
        } catch (error) {
            res.status(500).send('Error processing request');
            tunnel.pi.removeListener('message', messageHandler);
        }
    };

    tunnel.pi.on('message', messageHandler);
};

// Add route for specific tunnel paths
app.use('/tunnel/:tunnelId', handleTunnelRequest);

// Add route for the root tunnel URL (must come after the more specific route)
app.get('/tunnel/:tunnelId', handleRootTunnel);

wss.on('connection', (ws: TunnelClient, req: IncomingMessage) => {
    const clientId = Math.random().toString(36).substring(7);
    ws.clientId = clientId;
    
    console.log(`New client connected. ID: ${clientId}`);
    console.log(`Total clients connected: ${clients.size + 1}`);
    
    ws.on('message', (message: string) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'register') {
                ws.isRaspberryPi = data.isRaspberryPi;
                clients.set(clientId, ws);
                console.log(`Client ${clientId} registered as ${data.isRaspberryPi ? 'Raspberry Pi' : 'browser'}`);
                ws.send(JSON.stringify({ type: 'registered', clientId }));
            } 
            else if (data.type === 'tunnel') {
                if (ws.isRaspberryPi) {
                    // Handle Raspberry Pi connection
                    tunnels.set(clientId, { pi: ws, browser: null! });
                    const tunnelUrl = `${req.headers.host}/tunnel/${clientId}`;
                    console.log(`New tunnel created: ${tunnelUrl}`);
                    console.log(`Total active tunnels: ${tunnels.size}`);
                    ws.send(JSON.stringify({ 
                        type: 'tunnel_created', 
                        tunnelUrl: tunnelUrl
                    }));
                } else {
                    // Handle browser connection to tunnel
                    const tunnel = tunnels.get(data.tunnelId);
                    if (tunnel && tunnel.pi) {
                        tunnel.browser = ws;
                        console.log(`Browser connected to tunnel: ${data.tunnelId}`);
                        tunnel.pi.send(JSON.stringify({ 
                            type: 'browser_connected' 
                        }));
                    }
                }
            }
            else if (data.type === 'data') {
                // Forward data between Pi and browser
                const tunnel = Array.from(tunnels.values())
                    .find(t => t.pi === ws || t.browser === ws);
                
                if (tunnel) {
                    const target = ws === tunnel.pi ? tunnel.browser : tunnel.pi;
                    target?.send(JSON.stringify({ 
                        type: 'data', 
                        payload: data.payload 
                    }));
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        if (clients.has(clientId)) {
            clients.delete(clientId);
        }
        
        // Clean up tunnels
        for (const [id, tunnel] of tunnels.entries()) {
            if (tunnel.pi === ws || tunnel.browser === ws) {
                const peer = tunnel.pi === ws ? tunnel.browser : tunnel.pi;
                peer?.close();
                tunnels.delete(id);
            }
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
