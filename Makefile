LINT = node_modules/.bin/jshint
MOCHA = node_modules/.bin/_mocha
ISTANBUL = node_modules/.bin/istanbul

all: lint test-cov

lint: index.js
	@ $(LINT) index.js

test: .PHONY
	@ node --harmony $(MOCHA)

test-cov: .PHONY
	@ node --harmony $(ISTANBUL) cover $(MOCHA)

test-travis: lint test-cov
	@ node --harmony $(ISTANBUL) check-coverage

.PHONY:
