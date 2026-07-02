import dotenv from "dotenv";
import fetch from "node-fetch"; // O usar fetch nativo si está disponible en v22
dotenv.config();

const apiKey = process.env.DID_API_KEY?.trim();
const authHeader = `Basic ${Buffer.from(apiKey + ":").toString("base64")}`;

async function main() {
  const jobId = "tlk_3qOXGESTtAwx5b8LQgyUI";
  console.log("Querying job ID:", jobId);
  
  const response = await fetch(`https://api.d-id.com/talks/${jobId}`, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  console.log("D-ID response data:");
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
