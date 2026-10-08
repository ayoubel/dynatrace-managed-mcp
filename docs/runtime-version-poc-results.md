# POC versions manquantes — MCP Dynatrace Managed

Réalisé le 8 octobre 2026, environnement poc. Sélection à partir de l’audit runtime enregistré à 2026-10-08T13:05:26.078Z. Un seul Process par libellé ; les lectures communes ont été réutilisées. 17 Process distincts pour les 20 libellés restants. containerd avait déjà fait l’objet d’un POC distinct.

Les lectures réelles passent exclusivement par les outils MCP Dynatrace (get_entity_details, discover_entities, query_logs). Aucun accès Kubernetes, SSH ou registre d’images. Les sources documentaires servent uniquement à interpréter les données retournées.

## Statut de chaque POC

| Technologie | Statut du POC | Résultat |
| --- | --- | --- |
| containerd | ⚪ Version non retrouvée — POC précédent | Process, Process group, Host, Kubernetes node, runtime components, conteneur et shim examinés ; aucune version containerd. Recherches containerd/K3s sur 7 jours sans résultat. |
| Runtime | ⚪ Classification à revoir | Le Process choisi est agetty : Runtime est un libellé de repli, pas une technologie identifiée. |
| Go | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| Erlang | 🟡 Indice retrouvé | EXE_PATH contient erts-14.2.5 ; version ERTS issue du chemin. Correspondance documentaire avec OTP 26.2.5, à qualifier avant utilisation pour le score. |
| LIBC (musl) | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| Redis | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| SQLite | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| Python | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| MongoDB | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| LINUX_SYSTEM | ⚪ Classification à revoir | Libellé système générique ; ne pas attribuer une fin de support de produit autonome. |
| PostgreSQL | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| CoreDNS | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| Logback | ⚪ Version non retrouvée | Process/Process group sans version Logback ; les onze SOFTWARE_COMPONENT liés au seul Process Nexus ont des propriétés vides. |
| Log4j | ⚪ Version non retrouvée | Process/Process group sans version Log4j ; les onze SOFTWARE_COMPONENT liés au seul Process Nexus ont des propriétés vides. |
| MySQL / MariaDB | 🟡 Produit à corriger / version inconnue | EXE_PATH=/opt/bitnami/mariadb/sbin/mariadbd : indice MariaDB malgré la détection MYSQL ; aucune version. |
| Java | ✅ Version retrouvée | 17.0.19 dans properties.jvmClrVersion ; processType=APMNG empêche le fallback actuel de l’audit. |
| AMQP | ⚪ Protocole à distinguer du produit | Le même Process détecte RabbitMQ et Erlang ; aucun numéro de version AMQP exposé. |
| RabbitMQ | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |
| Java HttpURLConnection | 🔵 Rattachement au JDK proposé | Composant Java intégré ; le même Process expose Java Adoptium 21.0.10. Pas de version produit indépendante retrouvée. |
| JDK HTTP Client | 🔵 Rattachement au JDK proposé | Module Java intégré ; le même Process expose Java Adoptium 21.0.10. Pas de version produit indépendante retrouvée. |
| Apache Tomcat | ⚪ Version non retrouvée | Aucune version du composant dans le Process ou son Process group. |

## Méthode et limites

Chaque Process et son Process group ont été lus intégralement. Le premier conteneur directement lié, lorsqu’il existe, a été examiné comme contexte uniquement : les noms d’images retournés sont des identifiants/digests, pas des versions logicielles. Un conteneur lié n’est pas une preuve de version du runtime ou d’une bibliothèque.

Sur les 20 libellés, 16 reposent sur des Process dont les sources de logs listées ne sont pas envoyées au stockage. Trois libellés ont donné lieu à des recherches de logs par Host sur 7 jours, avec zéro résultat ; une version JVM a été confirmée sans recherche de logs. Aucune recherche de flotte ni collecte de tous les Process n’a été déclenchée.

Pour Nexus, la découverte des SOFTWARE_COMPONENT a été limitée aux onze IDs déjà liés au seul Process ciblé. Leurs détails sont vides. Le RUNTIME_COMPONENT lié confirme Java 1.8.0_422, déjà connu ; il ne fournit pas Log4j ou Logback. Cela ne démontre pas que d’autres API Dynatrace ou configurations ne puissent exposer des preuves supplémentaires.

Une version non retrouvée reste inconnue : elle n’est ni obsolète ni supportée par défaut. Les observations d’un Process ne sont pas extrapolées aux autres assets. Les indices de chemin ne remplacent pas des preuves de version explicitement attribuées.

## Améliorations identifiées, non implémentées dans ce POC

1. Exploiter jvmClrVersion pour une technologie JAVA explicitement détectée même si processType est APMNG. Le fallback actuel exige que Java soit la technologie principale ; c’est la cause du cas ActiveGate manquant. Ne pas réutiliser une version DYNATRACE comme version Java.
2. Représenter HttpURLConnection et JDK HTTP Client comme composants intégrés au JDK observé, avec provenance et politique explicites, plutôt que deux logiciels indépendants à version manquante.
3. Ajouter une extraction qualifiée de version ERTS depuis EXE_PATH. La correspondance OTP est un enrichissement documentaire, pas un numéro directement exposé par Dynatrace.
4. Distinguer MariaDB lorsque le chemin de l’exécutable l’indique ; une version MySQL ne doit pas être appliquée par défaut.
5. Séparer les libellés génériques et protocoles (Runtime, LINUX_SYSTEM, AMQP) des produits disposant d’un cycle de support propre.
6. Afficher la raison d’une preuve manquante : source sans version, logs non envoyés au stockage ou recherche sans résultat.

## Détail par POC

### Runtime

- Statut : ⚪ Classification à revoir.
- Process : agetty — `PROCESS_GROUP_INSTANCE-028BB80F8929C9AF`.
- Host : `HOST-B657C60AA69325CC`.
- Constat : Le Process choisi est agetty : Runtime est un libellé de repli, pas une technologie identifiée.
- Logs : Recherche limitée au Host sur 7 jours : 0 log retourné (limit=1). Aucun résultat n’établit pas une absence de collecte globale.

### Go

- Statut : ⚪ Version non retrouvée.
- Process : livenessprobe vsphere-csi-node (vsphere-csi-node-fnlwr) — `PROCESS_GROUP_INSTANCE-02FA7DD8766D0C60`.
- Host : `HOST-D4CB688F84F77084`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Erlang

- Statut : 🟡 Indice retrouvé.
- Process : Erlang Port Mapper ilemerp-rabbit-rabbitmq-* rabbitmq (ilemerp-rabbit-rabbitmq-0) — `PROCESS_GROUP_INSTANCE-08E75681E4E056E9`.
- Host : `HOST-D1DCDE1AA1034E00`.
- Constat : EXE_PATH contient erts-14.2.5 ; version ERTS issue du chemin. Correspondance documentaire avec OTP 26.2.5, à qualifier avant utilisation pour le score.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### LIBC (musl)

- Statut : ⚪ Version non retrouvée.
- Process : nginx rancher-monitoring-grafana-* (rancher-monitoring-grafana-6f869749b5-q2b6z) — `PROCESS_GROUP_INSTANCE-0987447F55DF6DAB`.
- Host : `HOST-7745AE6621E9F8FD`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Redis

- Statut : ⚪ Version non retrouvée.
- Process : Redis argocd-redis-* (argocd-redis-7d85c5d7b8-zpk7j) — `PROCESS_GROUP_INSTANCE-0BDF0D9624BB60AD`.
- Host : `HOST-B657C60AA69325CC`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### SQLite

- Statut : ⚪ Version non retrouvée.
- Process : PHP-FPM details-laravel-production-* (details-laravel-production-5c7f956976-5p9kf) — `PROCESS_GROUP_INSTANCE-13D1B28D8380B436`.
- Host : `HOST-0FD83553A346ECA6`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Python

- Statut : ⚪ Version non retrouvée.
- Process : networkd-dispatcher — `PROCESS_GROUP_INSTANCE-204DE162818D07F5`.
- Host : `HOST-B657C60AA69325CC`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Recherche limitée au Host sur 7 jours : 0 log retourné (limit=1). Aucun résultat n’établit pas une absence de collecte globale.

### MongoDB

- Statut : ⚪ Version non retrouvée.
- Process : MongoDB mongodb-* (mongodb-0) — `PROCESS_GROUP_INSTANCE-275A9148F612D20D`.
- Host : `HOST-D4CB688F84F77084`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Recherche limitée au Host sur 7 jours : 0 log retourné (limit=1). Aucun résultat n’établit pas une absence de collecte globale.

### LINUX_SYSTEM

- Statut : ⚪ Classification à revoir.
- Process : Linux System — `PROCESS_GROUP_INSTANCE-43081585A94F7B2A`.
- Host : `HOST-D1DCDE1AA1034E00`.
- Constat : Libellé système générique ; ne pas attribuer une fin de support de produit autonome.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### PostgreSQL

- Statut : ⚪ Version non retrouvée.
- Process : Postgres postgresql-primary-* (data) — `PROCESS_GROUP_INSTANCE-43603149E52DA6FD`.
- Host : `HOST-D4CB688F84F77084`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### CoreDNS

- Statut : ⚪ Version non retrouvée.
- Process : CoreDNS excoredns-* (excoredns-9c9967d5d-5f2nj) — `PROCESS_GROUP_INSTANCE-45235C3F946F7A4D`.
- Host : `HOST-0FD83553A346ECA6`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Logback

- Statut : ⚪ Version non retrouvée.
- Process : com.install4j.runtime.launcher.UnixLauncher nexus-* (nexus-577f7fd5f6-rl4ts) — `PROCESS_GROUP_INSTANCE-4598415F4614E240`.
- Host : `HOST-0FD83553A346ECA6`.
- Constat : Process/Process group sans version Logback ; les onze SOFTWARE_COMPONENT liés au seul Process Nexus ont des propriétés vides.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Log4j

- Statut : ⚪ Version non retrouvée.
- Process : com.install4j.runtime.launcher.UnixLauncher nexus-* (nexus-577f7fd5f6-rl4ts) — `PROCESS_GROUP_INSTANCE-4598415F4614E240`.
- Host : `HOST-0FD83553A346ECA6`.
- Constat : Process/Process group sans version Log4j ; les onze SOFTWARE_COMPONENT liés au seul Process Nexus ont des propriétés vides.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### MySQL / MariaDB

- Statut : 🟡 Produit à corriger / version inconnue.
- Process : MySQL mariadb-mariadb-galera-* (mariadb-mariadb-galera-1) — `PROCESS_GROUP_INSTANCE-4E177D0F1619637F`.
- Host : `HOST-D1DCDE1AA1034E00`.
- Constat : EXE_PATH=/opt/bitnami/mariadb/sbin/mariadbd : indice MariaDB malgré la détection MYSQL ; aucune version.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Java

- Statut : ✅ Version retrouvée.
- Process : Dynatrace ActiveGate (eks-ilemgv1-activegate-0) — `PROCESS_GROUP_INSTANCE-5C9025B852408DFD`.
- Host : `HOST-D1DCDE1AA1034E00`.
- Constat : 17.0.19 dans properties.jvmClrVersion ; processType=APMNG empêche le fallback actuel de l’audit.
- Logs : Logs non nécessaires pour confirmer la version JVM.

### AMQP

- Statut : ⚪ Protocole à distinguer du produit.
- Process : RabbitMQ ilemerp-rabbit-rabbitmq-* rabbitmq (ilemerp-rabbit-rabbitmq-1) — `PROCESS_GROUP_INSTANCE-5E2AAA4D4B8D5EA0`.
- Host : `HOST-D4CB688F84F77084`.
- Constat : Le même Process détecte RabbitMQ et Erlang ; aucun numéro de version AMQP exposé.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### RabbitMQ

- Statut : ⚪ Version non retrouvée.
- Process : RabbitMQ ilemerp-rabbit-rabbitmq-* rabbitmq (ilemerp-rabbit-rabbitmq-1) — `PROCESS_GROUP_INSTANCE-5E2AAA4D4B8D5EA0`.
- Host : `HOST-D4CB688F84F77084`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Java HttpURLConnection

- Statut : 🔵 Rattachement au JDK proposé.
- Process : SpringBoot ilemerp-ws-server org.weforum.esms.wsServer.Application (kubernetes) ilemerp-ws-server-* (ilemerp-ws-server-7765fc4d6f-bfr27) — `PROCESS_GROUP_INSTANCE-A03B6179A87C15B6`.
- Host : `HOST-D4CB688F84F77084`.
- Constat : Composant Java intégré ; le même Process expose Java Adoptium 21.0.10. Pas de version produit indépendante retrouvée.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### JDK HTTP Client

- Statut : 🔵 Rattachement au JDK proposé.
- Process : SpringBoot ilemerp-ws-server org.weforum.esms.wsServer.Application (kubernetes) ilemerp-ws-server-* (ilemerp-ws-server-7765fc4d6f-bfr27) — `PROCESS_GROUP_INSTANCE-A03B6179A87C15B6`.
- Host : `HOST-D4CB688F84F77084`.
- Constat : Module Java intégré ; le même Process expose Java Adoptium 21.0.10. Pas de version produit indépendante retrouvée.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

### Apache Tomcat

- Statut : ⚪ Version non retrouvée.
- Process : SpringBoot iops-app com.ilemgroup.iops.app.IopsAppApplication (test) vmdiscovery-app-* (vmdiscovery-app-6bd858c8b9-9ps9p) — `PROCESS_GROUP_INSTANCE-C87CF610966E0D42`.
- Host : `HOST-7745AE6621E9F8FD`.
- Constat : Aucune version du composant dans le Process ou son Process group.
- Logs : Dynatrace indique LOG_STORAGE_CONFIGURATION_STATUS_NOT_SEND_TO_STORAGE pour les sources listées de ce Process.

## Sources d’interprétation

- [Versions Erlang/OTP et composants ERTS](https://www.erlang.org/versions?v=26.2.5) : ERTS 14.2.5 est associé à OTP 26.2.5 ; le chemin seul ne garantit pas la release complète de l’installation.
- [HttpURLConnection, module java.base](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/HttpURLConnection.html).
- [Client HTTP, module java.net.http](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/module-summary.html).

Les réponses brutes et scripts du POC sont conservés localement dans /private/tmp/daybreak-runtime-three avec accès restreint ; ils ne sont pas intégrés au dépôt. Ce rapport contient la synthèse durable.
