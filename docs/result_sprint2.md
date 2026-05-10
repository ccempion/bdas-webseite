Sprint 2 done. Summary:                    
                                              
  Groups module (@bdas/groups)
  - Schema + 0001_init.sql: one table groups (id, slug, name, city, university, description,
  contact_email, instagram_url, website_url, status, timestamps). join_fee_* deliberately omitted  
  (Phase 6).                                                                                     
  - Services: listGroups({ status? }), getGroupBySlug, getGroup, getJoinPolicy (Phase-1 stub       
  returning { required: false }), upsertGroupBySlug.                                        
  - 5-test integration suite (skips locally, runs in CI's Postgres service).                       
  - Events: groups.group.created, groups.group.updated.                                            
                                                                                                   
  Seed workflow ("peu à peu")                                                                      
  - infra/seeds/groups.json is the source of truth — BDAS Aachen seeded with the data you gave     
  (slug aachen, name "BDAS Aachen", city "Aachen", aachen@bdas.de, the Instagram URL).             
  - pnpm groups:seed reads the JSON and idempotent-upserts each entry by slug.                     
  - Adding a group going forward = edit the JSON + re-run + commit. No SQL, no admin UI required.  
                                                                                                   
  Public pages (apps/web)                                                                          
  - /gruppen — list of active groups as hover-lift cards.                                          
  - /gruppen/[slug] — profile with city, university (optional), description (optional), and a      
  Kontakt card with email/Instagram/website links rendered only when present.                
  - Both flag-gated on BDAS_FLAG_GROUPS. Homepage shows a Hochschulgruppen card when the flag is   
  on.                                                       
                                                                                                   
  To preview locally:                                       

                                                                    
  pnpm groups:seed                 # writes Aachen          
  BDAS_FLAG_GROUPS=true pnpm --filter @bdas/web dev                                                
  # open http://localhost:3000/gruppen → /gruppen/aachen                                           
                                                                                                   
  Flag any of these for the Aachen entry that need correcting: name (BDAS Aachen), city (Aachen),  
  or status. Description, university, website are blank — extend the JSON when you have the copy.  
                                                            
  Next session: Members module (Sprint 3) — schema with members.primary_group_id → groups.id,      
  profile CRUD, status transitions, grantRole/revokeRole privilege guards, the temporary
  /admin/pending-members page for board approval.                                                  
                                                       