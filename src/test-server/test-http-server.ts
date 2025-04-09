import * as http from 'http';

const server = http.createServer((req, res) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('Hello from Test Server! The tunnel is working!');
    } else if (req.url === '/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'Test endpoint',
            timestamp: new Date().toISOString(),
            path: req.url
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const port = 8080;
server.listen(port, () => {
    console.log(`Test server running at http://localhost:${port}`);
});
