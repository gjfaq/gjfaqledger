// netlify/functions/metal-prices.js
//
// Proxies metalpriceapi.com so the API key never reaches the browser. The client
// (index.html) calls /.netlify/functions/metal-prices with no key attached; this
// function reads the real key from a Netlify environment variable (server-side only,
// never in the deployed file), calls metalpriceapi.com, and returns just
// { gold, silver } in USD per troy ounce.
//
// Setup required in the Netlify dashboard (one-time):
//   Site settings -> Environment variables -> add METALPRICEAPI_KEY = <your real key>
//
// metalpriceapi.com's /v1/latest returns rates as "1 USD = X ounces of metal" (a small
// decimal), not a USD price directly — e.g. XAU: 0.00049817281835633. To get the
// USD-per-ounce price, invert it: 1 / rate. Confirmed against their own documented
// example (1 / 0.00049817281835633 = 2007.33 USD).

exports.handler = async function (event, context) {
  const apiKey = process.env.METALPRICEAPI_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing METALPRICEAPI_KEY environment variable. Set it in Netlify Site settings > Environment variables.' }),
    };
  }

  try {
    const url = `https://api.metalpriceapi.com/v1/latest?api_key=${apiKey}&base=USD&currencies=XAU,XAG`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();

    if (!d || !d.success || !d.rates || !d.rates.XAU || !d.rates.XAG) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Unexpected response from metalpriceapi.com', raw: d }),
      };
    }

    const gold = 1 / d.rates.XAU;
    const silver = 1 / d.rates.XAG;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Short server-side cache so repeated app-opens within a minute or two don't
        // burn through the free-tier request quota unnecessarily.
        'Cache-Control': 'public, max-age=120',
      },
      body: JSON.stringify({
        gold,
        silver,
        fetchedAt: new Date().toISOString(),
      }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: String(e && e.message ? e.message : e) }),
    };
  }
};
