Maya's Cat Page: the demo site from the Website Anatomy and Website Hosting widgets.

What is in the folder
  public/              the folder a server hands out. Everything the site needs is inside it.
    index.html         the top file. Double-click it to open it in a browser.
    about/index.html   a second page, reached from the "About me" link.
    css/style.css      the paint.
    img/mochi.png      the picture.
    js/app.js          the electricity. It adds the "Pet Mochi" button.
  firebase.json        tells Firebase which folder to serve: "public".

Things to try
  1. Double-click public/index.html. The address starts with file:// because the browser read your disk.
  2. Right-click the heading and choose Inspect. That is the document tree.
  3. Rename css/style.css to css/styles.css and reload. The paint disappears, the page survives.
  4. Open public/about/index.html and compare its link addresses with the ones in public/index.html.
  5. In Terminal: cd into this folder, run "firebase init hosting" (keep public as the folder), then "firebase deploy".
     Your copy of this folder now lives on a server that never sleeps.
