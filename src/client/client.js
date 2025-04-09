"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const node_fetch_1 = __importDefault(require("node-fetch"));
class TunnelClient {
    constructor(options) {
        this.localPort = options.localPort;
        this.ws = new ws_1.default(options.serverUrl);
        this.setupWebSocket();
    }
    setupWebSocket() {
        this.ws.on('open', () => {
            console.log('Connected to tunnel server');
            this.register();
        });
        this.ws.on('message', (message) => __awaiter(this, void 0, void 0, function* () {
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
                    yield this.handleIncomingRequest(data.payload);
                }
            }
            catch (error) {
                console.error('Error processing message:', error);
            }
        }));
        this.ws.on('close', () => {
            console.log('Connection to server closed');
            setTimeout(() => this.reconnect(), 5000);
        });
        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }
    register() {
        this.ws.send(JSON.stringify({
            type: 'register',
            isRaspberryPi: true
        }));
    }
    createTunnel() {
        this.ws.send(JSON.stringify({
            type: 'tunnel'
        }));
    }
    handleIncomingRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Forward the request to the local service
                const response = yield (0, node_fetch_1.default)(`http://localhost:${this.localPort}${request.path || '/'}`, {
                    method: request.method || 'GET',
                    headers: request.headers,
                    body: request.body ? JSON.stringify(request.body) : undefined
                });
                // Get response data
                const responseData = yield response.text();
                // Send response back through the tunnel
                this.ws.send(JSON.stringify({
                    type: 'data',
                    payload: responseData
                }));
            }
            catch (error) {
                console.error('Error forwarding request:', error);
                this.ws.send(JSON.stringify({
                    type: 'data',
                    payload: 'Error: Could not forward request to local service'
                }));
            }
        });
    }
    reconnect() {
        console.log('Attempting to reconnect...');
        this.ws = new ws_1.default(this.ws.url);
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
