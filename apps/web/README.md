# Web app

Primary product interface.

Current implemented routes:
- `/projects`
- `/projects/[projectId]`
- `/people`
- `/people/[personId]`
- `/library`

Current scope in this repo:
- server-rendered technical scaffold only
- projects list and project detail
- people list with office/capacity context
- project checklist visibility
- project time visibility and labor cost rollups
- shared library document visibility
- seeded preview fallback when Supabase is not configured

Out of scope for the current V1 web scaffold:
- dedicated web time entry
- manager time approval
- top-level staffing planner
- polished visual design without an approved design source
