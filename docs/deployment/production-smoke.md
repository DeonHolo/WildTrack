# Production smoke check

WildTrack's backend uses Heroku's official Java buildpack. Docker and a locally installed PostgreSQL server are not required.

From the repository root, run the same Maven reactor build Heroku detects:

```powershell
mvn -DskipTests clean install
```

Run the packaged production JAR against an embedded real PostgreSQL instance:

```powershell
mvn -pl backend "-Dtest=HerokuBuildpackContractTest" "-Dit.test=PackagedProductionSmokeIT" verify
```

The smoke test uses non-secret placeholder values, starts the packaged JAR with the `production` profile on a supplied port, applies every Flyway migration, checks database readiness over HTTP, and shuts down both processes.

A real deployment supplies these values through Heroku config vars:

- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `WILDTRACK_GOOGLE_CLIENT_ID`
- `WILDTRACK_STAFF_BOOTSTRAP_ASSIGNMENTS`
- `CAPVAULT_CORS_ALLOWED_ORIGINS`

Do not place real values in this repository.
