# ADR 0033: Blog comments are flat, member-only, and plain text

**Status:** Accepted
**Date:** 2026-08-08

## Context

`docs/bdas-platform-spec.md` §3 lists "Internal social-network features (DMs,
feeds, comments)" as a v1 non-goal. That same list also excludes "a public
marketing/blog website" — yet the blog module shipped, under the design at
`docs/superpowers/specs/2026-07-22-blog-module-design.md` and ADR 0030. The
non-goal list predates the module-by-module decisions that followed it.

Comments were deferred rather than rejected when the blog shipped: the module
was built with a `CommentsPlaceholder` that already encodes the visibility rule
decided for them (external and signed-out visitors never see a comments
region, not even via a post's share link). The open question was when, and in
what shape — not whether.

## Decision

Blog posts carry comments, scoped deliberately narrowly:

- **Flat.** No threading, no replies. A comment never references another.
- **Plain text**, 1–1000 characters. No rich text, images, or attachments.
- **Members and alumni only**, for both reading and writing. Eligibility is
  ADR 0030's `canAuthor()` rule reused verbatim rather than redefined, so
  posting rights and commenting rights cannot drift apart.
- **Deletion by the comment's own author or the federal board.** A post's
  author may **not** delete comments on their own post — an author silencing
  critics on their own post, with no record, is not a power this platform
  grants.
- **No reporting flow for comments.** The post-level report queue is unchanged.
  A second moderation queue is not justified at this scale.
- Shipped behind `BDAS_FLAG_BLOG_COMMENTS`, off by default. The `blog` flag is
  already on in production, so without a sub-flag a merge would switch comments
  on federation-wide on deploy.

This supersedes the platform spec §3 non-goal for the blog module only. Other
modules gain nothing from it — this is not a general licence for social
features.

## Consequences

- Members can discuss posts in place instead of moving the conversation to
  WhatsApp. The spec's non-goal of "replacing WhatsApp as the day-to-day chat
  channel" is unaffected: this is discussion attached to a specific post, not a
  chat channel.
- Abuse is bounded the same way authoring is (ADR 0030): rate limiting (20 per
  24 hours), post-publish moderation, and no pre-restriction on who may write.
- **Author notification is deferred.** Nobody is emailed when their post is
  commented on. The known risk is that a comment on an older post goes unseen,
  which is the usual way a comment feature ends up feeling dead. The feed
  comment count is a partial mitigation. Revisit if discussion does not take.
- `deleteCommentsByAuthor` is exported as the seam a future account-deletion
  feature will call, so no other module ever touches `post_comments` directly.
  Account deletion itself **does not exist** in this platform and must be
  designed across posts, profile photos, files, and event registrations
  together — not smuggled in per-module.
