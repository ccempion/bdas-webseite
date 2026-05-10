  summary - sprint 1
  
  - ADR 0002 locks the SSO JWT shape: HS256, claims iss/sub/email/roles/ver/iat/exp/jti, cookie    
  bdas_session on .bdas.de, fixed 7-day expiry, ver-based forward compatibility.                 
  - core/design-system ships Button, Input, Card, Alert, Form/Field/Label, plus a cx joiner — all  
  consuming the tokens, no raw values. Switched the package to react-jsx for clean type-checking.  
  - apps/web scaffolded: Next.js 14 App Router, Tailwind preset wired, German root layout, four    
  pages (/, /anmelden, /registrieren, /passwort-zuruecksetzen, /account) using the primitives. Auth
   routes 404 until BDAS_FLAG_AUTH=true.                    
  - All gates green: 31 tests pass, typecheck clean across 10 workspaces, lint exit 0, prettier    
  clean.                                                                                           
  
  Next session: the auth module — schema + migration, register/verify/login/logout/password-reset  
  services with Lucia, JWT issuer per ADR 0002, rate limiter, getCurrentUser / requireRole exports,
   integration tests against Docker Postgres, and wiring those services into the existing pages.


   Sprint 1 done. Recap:                                                                            
                                                             
  Auth module (@bdas/auth)                                                                         
  - Schema + 0001_init.sql: 6 tables (auth_users, auth_credentials, auth_sessions, 
  auth_email_verifications, auth_password_resets, auth_rate_limits).                               
  - Services: register, verifyEmail, login, logout, requestPasswordReset/completePasswordReset,    
  getCurrentUser, requireRole.                                                                     
  - JWT issuer per ADR 0002 (HS256, ver:1, claims iss/sub/email/roles/jti/iat/exp).                
  - Password hashing with @node-rs/argon2 (Argon2id, OWASP 2026 params).                           
  - Fixed-window rate limiter, DB-backed.                                          
  - Notifier interface + consoleNotifier + createResendNotifier driver.                            
  - Federal-board bootstrap honored via BDAS_FEDERAL_BOARD_EMAILS.                                 
  - 7-test integration suite against real Postgres (skips locally without Docker; runs in CI's     
  service container).                                                                              
                                                                                                   
  ADR 0003 supersedes the Lucia pin. CLAUDE.md §2 updated.                                         
                                                                                                   
  apps/web wired                                                                                   
  - Server Actions for register/login/password-reset (request + complete).                         
  - /abmelden POST route revokes the session row and clears the cookie.                            
  - New routes: /registrieren/erfolg, /verifizieren/[token], /passwort-zuruecksetzen/[token].
  - Forms migrated to client components using useFormState/useFormStatus so error alerts render    
  inline using the design-system primitives.                                                       
  - /account reads the JWT cookie via getCurrentUser and redirects unauthenticated users.          
                                                                                                   
  Gates: typecheck clean across 11 workspaces, lint exit 0, prettier clean, 31 tests passing       
  locally + 7 auth integration tests gated on a reachable Postgres (CI runs them).                 
                                                                                                   
  Next session: groups module (Sprint 2). Schema, getGroup/listGroups/getJoinPolicy, public        
  /gruppen and /gruppen/[slug] pages, seed for the ~20 known Hochschulgruppen.