# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| Latest  | Yes                |
| Older   | No                 |

Only the latest release receives security updates. We recommend always running the most recent version.

## Reporting a Vulnerability

If you discover a security vulnerability in Notez, please report it responsibly:

1. **GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/cogghaus/notez/security/advisories/new)
2. **Email**: Open a GitHub issue marked `[SECURITY]` if you cannot use advisories

**Please do NOT open a public GitHub issue for security vulnerabilities.**

## What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix release**: As soon as practical, depending on severity

## Scope

The following are in scope:

- Authentication and authorization bypasses
- SQL injection, XSS, CSRF
- Encryption weaknesses
- Privilege escalation
- Data exposure through API endpoints
- WebSocket security issues

The following are out of scope:

- Vulnerabilities in dependencies (report upstream)
- Denial of service via resource exhaustion on self-hosted instances
- Issues requiring physical access to the server
- Social engineering attacks
