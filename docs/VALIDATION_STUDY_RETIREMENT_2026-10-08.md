# Temporary Validation Study retirement

The MVP evidence has been exported and compiled. The owner requested removal of the temporary feature from the live application.

Removed its Admin navigation item, page route, page/client/CSV modules and the temporary backend controller/audit services. Old `/validation-study` bookmarks use the existing role-home fallback. The retired evidence API returns 404 for authenticated Admin requests. No database migration or deletion of responses, versions, exported evidence or frozen studies is included.

Verification: 14 App navigation/route tests passed; Vite production build passed; 22 backend security/persistence tests passed, including retired-endpoint 404 and normal saved-response coverage. Run backend checks with test-only Google identity properties because the sign-in boundary tests otherwise correctly receive 503 for an unconfigured client:

`mvn -q -Dwildtrack.google.identity.enabled=true -Dwildtrack.google.identity.client-id=test-client-id -Dtest=ProductionSecurityBoundaryTest,FormResponseStaffViewControllerTest,Goal3ResearcherControlledTest test`

Start from a clean backend build when removing classes. Local tests do not establish a live deployment. The change must merge to main and complete the configured frontend/backend deployments before the feature is gone from the hosted app. Confirm the Admin menu has no study entry and an authenticated request to its former API returns 404 after deployment.
