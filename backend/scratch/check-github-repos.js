const { Octokit } = require('@octokit/rest');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const token = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;

async function checkRepos() {
    try {
        const octokit = new Octokit({ auth: token });
        
        // 1. Get authenticated user info
        const { data: user } = await octokit.rest.users.getAuthenticated();
        console.log(`Authenticated User: "${user.login}" (Type: ${user.type})`);

        // 2. List user's organizations
        const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser();
        console.log(`User Organizations:`, orgs.map(o => o.login));

        // 3. Paginate all repositories
        console.log('\nFetching repositories via listForAuthenticatedUser...');
        const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
            affiliation: 'owner,collaborator,organization_member',
            visibility: 'all',
            per_page: 100
        });

        console.log(`Total Repositories Found: ${repos.length}`);
        
        // Count repositories by owner
        const countsByOwner = {};
        repos.forEach(r => {
            const owner = r.owner.login;
            countsByOwner[owner] = (countsByOwner[owner] || 0) + 1;
        });
        console.log('\nRepository Counts by Owner:', countsByOwner);

        console.log('\nSample Repositories (First 15):');
        repos.slice(0, 15).forEach(r => {
            console.log(`- ${r.full_name} (Private: ${r.private}, Owner: ${r.owner.login})`);
        });

    } catch (err) {
        console.error(err);
    }
}

checkRepos();
