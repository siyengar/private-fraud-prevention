build-extension:
	./chrome-dev/build

dev: build-extension
	FLASK_APP=app.py FLASK_ENV=development flask run
