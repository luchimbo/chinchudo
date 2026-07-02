import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      // Ignorar comentarios
      if (line.trim().startsWith('#')) return;
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        // Quitar comillas si tiene
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }
}

loadEnv();

const apiKey = process.env.DID_API_KEY || "mock";
const jobId = "tlk_V72EB-lqRbOnceBvHkWEm";

async function main() {
  if (apiKey === "mock" || !apiKey) {
    console.error("No real DID_API_KEY found in process.env");
    return;
  }

  const authHeader = `Basic ${Buffer.from(apiKey + ":").toString("base64")}`;
  const url = `https://api.d-id.com/talks/${jobId}`;
  
  console.log(`Checking D-ID job status for: ${jobId}`);
  try {
    const res = await globalThis.fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      }
    });

    const data = await res.json();
    console.log("Response Status:", res.status);
    console.log("Response Body:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

main();
