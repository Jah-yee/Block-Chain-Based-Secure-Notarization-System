const fs = require('fs');
const path = require('path');

async function mapEndpoints() {
    const routesDir = path.join(__dirname, '../src/routes');
    const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
    const endpointMap = [];

    console.log(`🔍 Mapping endpoints in ${files.length} route files...`);

    files.forEach(file => {
        const filePath = path.join(routesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Match router.get('/path', ...) or router.post("/path", ...)
        const regex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            endpointMap.push({
                file,
                method: match[1].toUpperCase(),
                path: match[2]
            });
            console.log(`[FOUND] ${match[1].toUpperCase()} ${match[2]} (in ${file})`);
        }
    });

    const output = endpointMap.map(e => `${e.method} ${e.path} (${e.file})`).join('\n');
    fs.writeFileSync(path.join(__dirname, 'endpoint_map.txt'), output);
    console.log(`✅ Mapped ${endpointMap.length} endpoints to tools/endpoint_map.txt`);
}

mapEndpoints();
