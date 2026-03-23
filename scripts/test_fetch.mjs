// Script to test API endpoint directly
const API_URL = 'http://localhost:5000'; // Assuming this is the port
const id = 'ITL-ESC-00000000000000000000000000000007';

async function testFetch() {
    try {
        console.log(`Fetch: ${API_URL}/api/biometrico/escritorio/${id}`);

        // We need a token or we can just bypass if it requires one by using direct db again,
        // wait, the routes have `router.use(verificarAutenticacion)`.
        // I can just mock the token or query the DB for an active token.
        console.log("We need auth to fetch. Checking db route instead");
    } catch (e) {
        console.error(e);
    }
}

testFetch();
