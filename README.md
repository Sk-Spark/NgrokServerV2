# TypeScript Tunneling Service

A tunneling solution similar to ngrok that allows you to expose your Raspberry Pi services through an Azure Web App. This project consists of two main components:
- A server component that runs on Azure Web App
- A client component that runs on your Raspberry Pi

## Prerequisites

- Node.js 14.x or later
- npm 6.x or later
- An Azure account and subscription
- A Raspberry Pi with Node.js installed
- Azure CLI (for deployment)

## Project Structure

```
├── src/
│   ├── client/
│   │   └── client.ts    # Client code that runs on Raspberry Pi
│   └── server/
│       └── server.ts    # Server code that runs on Azure Web App
├── package.json
└── tsconfig.json
```

## Local Development and Testing

1. Install dependencies:
```bash
npm install
```

2. Start the server locally:
```bash
npm run dev:server
```
This will start the server on port 3000 (or the port specified in the PORT environment variable)

3. In a separate terminal, start the client:
```bash
npm run dev:client
```

By default, the client will:
- Connect to ws://localhost:3000
- Forward traffic to localhost:8080

You can customize these settings using environment variables:
- TUNNEL_SERVER: The WebSocket URL of your server
- LOCAL_PORT: The local port to forward traffic to

## Deployment

### Deploying the Server to Azure Web App

1. Create an Azure Web App:
```bash
az login
az group create --name myTunnelGroup --location eastus
az appservice plan create --name myTunnelPlan --resource-group myTunnelGroup --sku B1
az webapp create --name myTunnelApp --resource-group myTunnelGroup --plan myTunnelPlan --runtime "node|14-lts"
```

2. Enable WebSocket support:
```bash
az webapp config set --name myTunnelApp --resource-group myTunnelGroup --web-sockets-enabled true
```

3. Deploy the application:
```bash
az webapp deployment source config-local-git --name myTunnelApp --resource-group myTunnelGroup
git init
git add .
git commit -m "Initial commit"
git remote add azure <URL_FROM_PREVIOUS_COMMAND>
git push azure master
```

### Setting up the Client on Raspberry Pi

1. Copy the project to your Raspberry Pi
2. Install dependencies:
```bash
npm install --production
```

3. Create a startup script (tunnel.sh):
```bash
#!/bin/bash
export TUNNEL_SERVER="ws://your-azure-app.azurewebsites.net"
export LOCAL_PORT="8080"  # Change this to match your service
npm run start:client
```

4. Make the script executable:
```bash
chmod +x tunnel.sh
```

5. Run the client:
```bash
./tunnel.sh
```

## Environment Variables

### Server
- PORT: The port the server will listen on (default: 3000)

### Client
- TUNNEL_SERVER: WebSocket URL of the tunnel server
- LOCAL_PORT: Local port to forward traffic to (default: 8080)

## Security Considerations

1. The current implementation provides basic tunneling functionality. For production use, consider adding:
   - Authentication for both client and browser connections
   - TLS/SSL encryption
   - Rate limiting
   - Access control lists

2. When exposing services, always ensure that:
   - The local service has proper authentication
   - Sensitive ports are not exposed
   - Traffic is encrypted

## Troubleshooting

1. Connection Issues
   - Verify WebSocket is enabled in Azure Web App
   - Check firewall settings on Raspberry Pi
   - Ensure the TUNNEL_SERVER URL is correct

2. Tunnel Not Working
   - Check if the local service is running
   - Verify the LOCAL_PORT matches your service
   - Check server logs for connection errors

## License

ISC
