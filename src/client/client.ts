import WebSocket from 'ws';
import * as http from 'http';
import fetch from 'node-fetch';

interface TunnelOptions {
    serverUrl: string;
    localPort: number;
}

class TunnelClient {
    private ws: WebSocket;
    private localPort: number;
    private clientId?: string;

    constructor(options: TunnelOptions) {
        this.localPort = options.localPort;
        this.ws = new WebSocket(options.serverUrl);
        this.setupWebSocket();
    }

    private setupWebSocket() {
        this.ws.on('open', () => {
            console.log('Connected to tunnel server');
            this.register();
        });

        this.ws.on('message', async (message: string) => {
            try {
                const data = JSON.parse(message.toString());
                
                if (data.type === 'registered') {
                    this.clientId = data.clientId;
                    console.log('Registered with server, requesting tunnel...');
                    this.createTunnel();
                }
                else if (data.type === 'tunnel_created') {
                    console.log(`Tunnel created! Public URL: http://${data.tunnelUrl}`);
                }
                else if (data.type === 'browser_connected') {
                    console.log('Browser connected to tunnel');
                }
                else if (data.type === 'data') {
                    await this.handleIncomingRequest(data.payload);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });

        this.ws.on('close', () => {
            console.log('Connection to server closed');
            setTimeout(() => this.reconnect(), 5000);
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    private register() {
        this.ws.send(JSON.stringify({
            type: 'register',
            isRaspberryPi: true
        }));
    }

    private createTunnel() {
        this.ws.send(JSON.stringify({
            type: 'tunnel'
        }));
    }

    private async handleIncomingRequest(request: any) {
        try {
            // Forward the request to the local service
            const response = await fetch(`http://localhost:${this.localPort}${request.path || '/'}`, {
                method: request.method || 'GET',
                headers: request.headers,
                body: request.body ? JSON.stringify(request.body) : undefined
            });

            // Get response data
            const responseData = await response.text();

            // Send response back through the tunnel
            this.ws.send(JSON.stringify({
                type: 'data',
                payload: responseData
            }));
        } catch (error) {
            console.error('Error forwarding request:', error);
            this.ws.send(JSON.stringify({
                type: 'data',
                payload: 'Error: Could not forward request to local service'
            }));
        }
    }

    private reconnect() {
        console.log('Attempting to reconnect...');
        this.ws = new WebSocket(this.ws.url);
        this.setupWebSocket();
    }
}

// Example usage
if (require.main === module) {
    const serverUrl = process.env.TUNNEL_SERVER || 'ws://localhost:3000';
    const localPort = parseInt(process.env.LOCAL_PORT || '8080');
    console.log(`Connecting to tunnel server at ${serverUrl}...`);
    console.log(`Local service running on port ${localPort}...`);
    new TunnelClient({
        serverUrl,
        localPort
    });
}
