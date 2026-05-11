
                                        
  On #4 (plugin install access):                                                                     
  Log into bdas.de/wp-admin → Plugins → Add New. If you see an "Upload Plugin" button at the top, you
   can install. If you only see the WordPress.org search box, the host has disabled file uploads and 
  we'll need FTP/SSH instead. Tell me what you see.         
                                                                                                     
  On #6 (DNS for Vercel):                                                                            
  Vercel will give you a CNAME target like cname.vercel-dns.com and ask you to add a CNAME record for
   dashboard.bdas.de. To do that you need access to whoever runs DNS for bdas.de. Quickest way to    
  find out who that is:                                     
  dig bdas.de NS +short                                                                              
  Whatever shows up there is your DNS host (likely your domain registrar — could be IONOS, Strato,
  GoDaddy, Cloudflare, etc.). When we get to deploying, log in there → DNS settings → add CNAME   
  dashboard → cname.vercel-dns.com.                                                                  
                                   
  On #7 (JWT secret):                                                                                
  Don't worry, I'll handle the runbook. When we wire it up:                                          
  openssl rand -base64 32                                                                            
  # copy the output                                                                                  
  Then paste it into .env.local (SSO_JWT_SECRET=...) AND into wp-config.php                          
  (define('BDAS_SSO_SECRET', '...');). Same string in both places. I'll write the docs when I build
  the plugin.                                                                                        
   
  On #3 ("alle Seiten aus der Navigationsleiste"):                                                   
  Two ways to do this:                                      
                                                                                                     
  - A — Embed: mirror every WP page inside the Next app. New URLs at dashboard.bdas.de/<page>. SEO   
  duplicate, more code, content lives in two places.                                                 
  - B — Top nav with cross-domain links: show the WP menu as the header on every Next page; links go 
  to bdas.de/<page> for the actual content. Since the SSO cookie is shared on .bdas.de, the user is  
  logged in on both sides and switching feels seamless. Single source of truth, less code.
                                                                                                     
  I'd default to B. Confirm or say otherwise.                                                        
  
  Let me look at the actual WP API now to see what menu data is exposed:     

   Two findings from the API check, then a decision for you.                                          
                                                                                                   
  Findings                                                                                           
  - WP REST works, pages and posts are exposed. ✓                                                    
  - The site is using the block-based (Gutenberg) editor — there's no /wp/v2/menus endpoint. Standard
   WP doesn't expose the navigation menu unless we add a small plugin endpoint.                      
  - 16 pages exist (Home, About, What we do, Projekte, Beitritt, Kontakt, Impressum,                 
  Datenschutzerklärung, Forum, Alevitentum, etc.), all flat (no parent, no menu_order). So I can't
  infer "which pages are in the nav" — pages and nav are different things in WP.                     
                                                                                
  Decision needed: how should the nav stay in sync?                                                  
                                                                                                     
  ┌─────┬───────────────────────────────────────────────────┬────────────────────────────────────┐
  │     │                     Approach                      │             Trade-off              │   
  ├─────┼───────────────────────────────────────────────────┼────────────────────────────────────┤
  │ A   │ You tell me the list of nav items (slugs + order, │ Fast to ship; you edit a JSON file │
  │     │  in German). I hardcode it.                       │  when nav changes.                 │
  ├─────┼───────────────────────────────────────────────────┼────────────────────────────────────┤   
  │     │ The SSO plugin (we're writing it anyway) exposes  │ ~25 extra lines of PHP. You edit   │
  │ B   │ /wp-json/bdas/v1/menu returning the primary nav.  │ nav in WP-admin; new site picks it │   
  │     │ Next app fetches it with revalidate: 3600.        │  up automatically within an hour.  │
  └─────┴───────────────────────────────────────────────────┴────────────────────────────────────┘   
                                                            
  I'd default to B — same pattern as the rest of content-bridge, single source of truth, minimal     
  extra code. Confirm or pick A.
                                                                                                     
  Also confirm: my earlier proposal that the nav links go to bdas.de/<slug> (the WordPress page), not
   to mirrored Next pages. I default to this. The shared .bdas.de cookie means the user stays logged
  in across both sides.                                                                              
                                                            
  Acknowledgements                                                                                   
  - ✓ #5 dashboard.bdas.de locked. I'll update PUBLIC_SITE_URL and the cookie domain accordingly.
  - ✓ #8 testing on the live site. I'll write the SSO plugin defensively — guards against missing    
  config, doesn't break existing WP pages if the cookie is malformed.                            
  - ✓ #9 cem.colak@bdas.de goes into BDAS_FEDERAL_BOARD_EMAILS.


    1. Run migrations against Supabase — DATABASE_URL=<your-supabase-uri> pnpm db:migrate from your    
  local terminal
  2. Run the groups seed — DATABASE_URL=<your-supabase-uri> pnpm --filter @bdas/infra groups:seed    
  3. Add the custom domain — in Vercel project → Settings → Domains → add dashboard.bdas.de, then add
   the CNAME record in your DNS                                                                      
  4. Upload the WP plugin — zip wp-plugin/bdas-sso/ and install it on bdas.de, then set              
  BDAS_SSO_JWT_SECRET in wp-config.php to the same value as SSO_JWT_SECRET in Vercel                 
                                                            
  What does the build log show?            


   1. Open https://dashboard.bdas.de — homepage should load with the BDAS header pulled from WordPress
  2. Click /registrieren — try registering a test account (it'll write to Supabase)
  3. Check the cookie domain — after login, open bdas.de and you should be logged in there too       
  (that's the SSO bridge)                                                                            
                                                                                                     
  What's left from the original plan:                                                                
  - Reset both DB passwords — you leaked BDAS_Deutschland! (Supabase) and the Strato DB password
  earlier in chat                                                                                    
  - Update the WP primary menu — those #services/#about items aren't right for BDAS
  - Add pnpm --filter @bdas/web build to CI — so we never ship a code change without verifying it    
  builds                                                                                             
                                         