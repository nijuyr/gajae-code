### Fixed

- Broker readiness-cutoff reaping keeps its previous process-observation behavior; an unreleased rework of that path was reverted after it left hosts in `terminal_uncertain` under concurrent recovery (#6143).
