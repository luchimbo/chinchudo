async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    console.log(`URL: ${url} -> Status: ${res.status}`);
  } catch (err) {
    console.error(`Error fetching ${url}:`, err.message);
  }
}

async function main() {
  await checkUrl("https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg");
  await checkUrl("https://images.pexels.com/photos/1043473/pexels-photo-1043473.jpeg");
  await checkUrl("https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg");
  await checkUrl("https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg");
  await checkUrl("https://images.pexels.com/photos/2287252/pexels-photo-2287252.jpeg");
}

main();
