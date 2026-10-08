# Runtime evidence enrichment — 8 October 2026

The audit now uses explicit `jvmClrVersion` for detected JAVA technology even
when the primary Process type is APMNG. Other technology versions, release
versions, OneAgent versions and image digests are not substituted.

HttpURLConnection and JDK HTTP Client inherit the support assessment of an
unambiguous Java version/edition on the same Process. The report marks this as
`supportDependency: Java` and `versionKind: inherited`; it is not an independent
technology version. These components and diagnostic detections (Runtime,
LINUX_SYSTEM, AMQP) remain visible but do not enter the compliance denominator
or upgrade-score simulation. The assessment exposes their contextual count.

Only EXE_PATH and EXE_NAME metadata are retained in the runtime inventory.
MariaDB paths qualify product identity. ERTS paths provide an explicit hint,
with source evidence, without inventing an Erlang/OTP version or support status.

Missing-version reasons distinguish no exposed version, an ERTS hint, integrated
JDK context and unidentified products. When Dynatrace exposes logSourceState
and every listed source is marked NOT_SEND_TO_STORAGE, the report records that
evidence. An absent logSourceState is not interpreted as disabled collection.
No automatic log searches or additional per-Process reads were introduced.

The application uses Process, Process group, Host and Kubernetes node, including
historical campaign presentation. Every asset card restores a separate safe
Dynatrace link, outside the selection button. Process links use the Managed
`#processdetails;id=...` route, also normalized for historical generic links.

Validation: TypeScript build; 350 MCP unit tests (the config-loader test required
permission to create its existing temporary home-directory fixture); 122 app
tests. Tests cover ambiguous JVM evidence, same-Process inheritance, score
deduplication, combined reports, ERTS/MariaDB provenance, metadata redaction,
terminology and safe direct links.

A real MCP runtime audit completed at 15:51 Europe/Zurich: 520 observations,
445 independent score units, 75 contextual units, 32 evaluated units. It exposes
six ERTS hints, three MariaDB detections and twelve integrated JDK assessments.
Java 17.0.19 is correctly attributed to the ActiveGate Process. Coverage remains
insufficient to publish a global score. The inventory response does not expose
log storage state on this environment; those cases remain “Version non exposée”.
