"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const express_1 = __importDefault(require("express"));
const http = __importStar(require("http"));
const WebSocket = __importStar(require("ws"));
const app = (0, express_1.default)();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Map();
const tunnels = new Map();
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
const handleTunnelRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const messageHandler = (message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'data') {
                    clearTimeout(timeout);
                    resolve(data.payload);
                }
            }
            catch (error) {
                reject(error);
            }
        };
        tunnel.pi.on('message', messageHandler);
    });
    try {
        const response = yield responsePromise;
        res.send(response);
    }
    catch (error) {
        res.status(500).send('Error processing request');
    }
});
// Add route for the root tunnel URL
const handleRootTunnel = (req, res) => {
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
    const messageHandler = (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'data') {
                res.send(data.payload);
                tunnel.pi.removeListener('message', messageHandler);
            }
        }
        catch (error) {
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
wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(7);
    ws.clientId = clientId;
    console.log(`New client connected. ID: ${clientId}`);
    console.log(`Total clients connected: ${clients.size + 1}`);
    ws.on('message', (message) => {
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
                    tunnels.set(clientId, { pi: ws, browser: null });
                    const tunnelUrl = `${req.headers.host}/tunnel/${clientId}`;
                    console.log(`New tunnel created: ${tunnelUrl}`);
                    console.log(`Total active tunnels: ${tunnels.size}`);
                    ws.send(JSON.stringify({
                        type: 'tunnel_created',
                        tunnelUrl: tunnelUrl
                    }));
                }
                else {
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
                    target === null || target === void 0 ? void 0 : target.send(JSON.stringify({
                        type: 'data',
                        payload: data.payload
                    }));
                }
            }
        }
        catch (error) {
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
                peer === null || peer === void 0 ? void 0 : peer.close();
                tunnels.delete(id);
            }
        }
    });
});
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
