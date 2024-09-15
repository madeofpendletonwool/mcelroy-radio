package main

import (
	"fmt"
	"log"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	// Serve the HTML page
	http.ServeFile(w, r, "index.html")
}

func main() {
	// Serve static files like CSS and JS from the "static" directory
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Serve the main webpage
	http.HandleFunc("/", handler)

	// Start the server on port 8080
	fmt.Println("Server started at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
