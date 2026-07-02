const fs = require('fs');

// Leer archivo .env manualmente
const envContent = fs.readFileSync('.env', 'utf8');
let apiKey = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('DID_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/"/g, '').trim();
  }
});

if (!apiKey) {
  console.error("No se encontró la clave DID_API_KEY en .env");
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(apiKey + ":").toString("base64")}`;
const jobId = "tlk_3qOXGESTtAwx5b8LQgyUI";

async function main() {
  console.log("Querying job ID:", jobId);
  
  const response = await fetch(`https://api.d-id.com/talks/${jobId}`, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  console.log("D-ID response data:");
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
