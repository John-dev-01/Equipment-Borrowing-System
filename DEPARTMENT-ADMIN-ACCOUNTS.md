# Department Admin Application Logins

These built-in application accounts are created for missing departments when the app starts in local development (`NODE_ENV` is not `production`). Sign in at `http://localhost:3000/login` with the email and password below.

| Department | Login email | Password |
|---|---|---|
| College of Engineering and Architecture | `cea.admin@my.cspc.edu.ph` | `cea123123` |
| College of Computer Studies | `ccs.admin@my.cspc.edu.ph` | `ccs123123` |
| College of Health Sciences | `chs.admin@my.cspc.edu.ph` | `chs123123` |
| College of Arts and Sciences | `cas.admin@my.cspc.edu.ph` | `cas123123` |
| College of Tourism, Hospitality, and Business Management | `thbm.admin@my.cspc.edu.ph` | `thbm123123` |
| College of Technological and Developmental Education | `ctde.admin@my.cspc.edu.ph` | `ctde123123` |
| Buhi Campus | `buhi.admin@my.cspc.edu.ph` | `buhi123123` |
| Graduate School / Advanced Programs | `gs.admin@my.cspc.edu.ph` | `gs123123` |

These are application usernames in email format. They do not create or prove the existence of actual campus email inboxes. Treat the passwords as local-development defaults only; they are weak and must be replaced with unique strong passwords before any public deployment. Accounts already assigned to a department are preserved rather than overwritten. Set `NODE_ENV=production` or `SEED_DEPARTMENT_ADMINS=false` to disable automatic account seeding.
