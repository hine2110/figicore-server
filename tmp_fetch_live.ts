import axios from 'axios';

async function testFetch() {
  try {
    const res = await axios.get('http://localhost:3000/livestreams?status=LIVE');
    console.log("Status:", res.status);
    console.log("Data structure:", Array.isArray(res.data) ? 'Array' : typeof res.data);
    console.log("Data:", JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.error(e.message);
  }
}

testFetch();
