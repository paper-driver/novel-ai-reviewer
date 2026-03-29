---
description: "Project-wide development standards from AGENTS.md"
---

# novel-ai-reviewer Development Standards

This workspace enforces specific development principles to ensure code quality, maintainability, and readiness for desktop app deployment. Reference the `AGENTS.md` file for complete guidelines.

## Quick Reference

**Before Implementation:**
- Create a plan using `manage_todo_list` for multi-step work
- Search for existing code to reuse (avoid duplication)
- Check API.md, ARCHITECTURE.md, README.md, CONTRIBUTING.md

**Design Considerations:**
- No feature breakage without explicit user request
- Design for cross-platform desktop app (Electron)
- Follow SOLID principles and OOP design patterns
- Ensure modular, encapsulated, reusable code

**During Implementation:**
- Use decomposition, abstraction, encapsulation
- Keep code DRY (Don't Repeat Yourself)
- Make targeted changes; avoid scope creep
- Verify tests pass and no regressions

**After Implementation:**
- Update API.md, ARCHITECTURE.md, README.md if needed
- Document breaking changes explicitly
- Ensure maintainability for future developers

## Key Files

- **AGENTS.md** — Complete development principles
- **API.md** — API contracts and endpoints
- **ARCHITECTURE.md** — System design and patterns
- **CONTRIBUTING.md** — Contribution guidelines
- **README.md** — Project overview and setup

For detailed guidance on specific implementations, use the "Development Standards Agent" from `.github/agents/development-standards.agent.md`.
