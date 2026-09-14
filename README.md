# Picture Studio

Run the editor through a local web server so browsers can safely export the PNG:

```bash
cd /Users/marshallhawkins/Developer/picture
chmod +x server.js
./server.js
```

Then open [http://localhost:4173](http://localhost:4173) in a browser. The launcher clears any existing process on port 4173 before it starts, so this URL stays consistent. Leave the Terminal window running while using the editor.

Opening `index.html` directly as a `file://` URL can preview the design, but browsers block PNG export for local-file security reasons. The server sends no-cache headers, so refreshing the browser always loads the current editor version.
