#install npm
npm install -g pnpm or via corepack

#Update npm
npm install -g npm@11.14.1

#docker
Docker Desktop running — Sprint 0 wires a local Postgres in Docker for development and tests                             

#github cli extension on vscode
GitHub CLI (gh) authenticated, optional but useful for the PR-per-module flow 

Supabase production project                                                                                                                            
- Create a Supabase account at supabase.com if you don't have one                                                          
- Create one Pro project for production (region: eu-central-1 / Frankfurt for GDPR)
- Save the project URL, anon key, and service-role key — I'll need these in .env.local once Sprint 1 starts                
- Don't bother creating a staging project yet; we'll add a free-tier one in Sprint 


- Decide which 1–3 email addresses get the implicit federal_board role on first login (per the env-var bootstrap rule in build-plan §2)

- These are the people who will use the temporary /admin/pending-members page in Sprint 3 and the real dashboard in Phase 3

- Just give me the email strings when ready  

evin.turan@bdas.de
akan.erol@bdas.de
cem.colak@bdas.de          


Tier 2 — Needed before Phase 1 ships to production (Sprint 4–5)                                                            
                                                                                                                             
Resend account + domain verification                                                                                                                             
  - Create a Resend account, add bdas.de as a sending domain                                                                 
  - DNS records (SPF, DKIM, DMARC) need to be added to your DNS provider — propagation can take hours, start early
  - Save the API key            


   Vercel account                                                                                                                                                                                     
  - Sign up, connect GitHub, give it access to ccempion/bdas-webseite                                                        
  - We'll create two Vercel projects (one per app) when we're closer to deployment
  - Note: confirm with the federation's legal contact whether Hobby plan is acceptable for an e.V. site, or whether Pro      
  ($20/month per app) is needed (per ADR 0001 follow-up)                                                                     
                                                                                                                             
  bdas.de DNS access                                                                                                         
                                                            
  - Make sure you (or whoever owns the domain) has login to the DNS provider                                                 
  - Sprint 4 will add the SSO cookie domain (*.bdas.de); Sprint 5 will set up bdas.de and dashboard.bdas.de to point at
  Vercel                                                                                                                     
                                                            
  WordPress URL + admin access                                                                                               
                                                            
  - Confirm where the existing WordPress install lives — I need the public URL for content-bridge configuration in Sprint 4  
  - We'll also need WordPress admin/FTP access at some point to install the bdas-sso plugin (Sprint 4)
                                                                                                                             
  Brand and content assets                                  
                                                                                                                             
  - BDAS logo as SVG (ideally), plus a fallback PNG                                                                          
  - Brand colors (hex codes) and font choices, if any are decided
  - The list of Hochschulgruppen to seed groups: name, university, city, slug, contact email, optional description           
                                                                                                                             
  ---                                                                                                                        
  Tier 3 — Can wait until later phases                                                                                       
                                                                                                                             
  - Stripe account — only needed in Phase 6 (payments)
  - Cloudflare R2 account — needed before Phase 1 hits production (for the backup pg_dump job per ADR 0001)                  
  - GitHub Actions secrets — I'll tell you what to add when CI needs them in Sprint 0; the actual values get added once      
  Supabase/Resend keys exist                                                                                            