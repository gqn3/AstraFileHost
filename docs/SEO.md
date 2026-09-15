# SEO and public content

AstraFileHost publishes English `/en` and Arabic `/ar` pages with separate localized content. Admin → Search optimization manages defaults; Pages & legal manages page-specific content and metadata.

## Publish a page

1. Sign in as OWNER or ADMIN and open `/admin/pages`.
2. Edit the English and Arabic draft, including title and description. Rich text is sanitized server-side.
3. Preview and publish deliberately. Saving a draft alone does not replace published content.
4. Check both language URLs and the intended indexing state. Restoring an older revision creates a new draft and still requires publication.

Home, about, privacy, terms, acceptable use, contact, abuse and copyright pages are available in the CMS. Review their content for your deployment before publishing; templates are not a substitute for an operator's policy decisions.

## Metadata

Public pages provide canonical links, language alternates, Open Graph/Twitter metadata and JSON-LD. Set the real canonical site origin after trusted HTTPS is configured. Use public, non-sensitive social images and branding files. `robots.txt` and `sitemap.xml` reflect published indexable pages.

Workspace, admin, account, API and capability-sharing routes are private/non-indexable. Robots directives are not access controls: authorization remains enforced by the backend. Do not put capability URLs, tokens or private filenames in metadata or analytics.

Google verification and optional analytics identifiers can be prepared through settings. Tracking remains disabled pending consent integration. Do not claim analytics are collecting data simply because an ID is saved.

Verify `/en`, `/ar`, the legal routes, `/robots.txt` and `/sitemap.xml` after publication. Client metadata and server HTML metadata should agree. Private repository topics and documentation do not make the hosted app publicly discoverable by themselves.
