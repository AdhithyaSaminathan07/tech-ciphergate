const { Octokit } = require("@octokit/rest");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function checkToken() {
    const token = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
    if (!token) {
        console.error("No token found!");
        return;
    }
    console.log("Token starts with:", token.substring(0, 10));
    try {
        const octokit = new Octokit({ auth: token });
        const { data } = await octokit.rest.users.getAuthenticated();
        console.log("Authenticated User:", data.login);
        console.log("User Type:", data.type);
        console.log("User Name:", data.name);
        console.log("User URL:", data.html_url);
    } catch (err) {
        console.error("Error checking token:", err.message);
    }
}

checkToken();
