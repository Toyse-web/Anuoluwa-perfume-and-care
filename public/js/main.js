document.addEventListener("click", (e) => {
    if (e.target.matches(".add-to-cart")) {
        const id = e.target.dataset.id;
        alert("Add to cart clicked for product " + id + " (cart not implemented yet)");
        // Later, axios.post("/cart", {productId: id, qty: 1})
    }
});

// THIS WORKS FOR BOTH THE ADMIN AND USERS LOGIN
 // password toggle functionality
  const togglePass = document.getElementById("togglePassword");
  const passInput = document.getElementById("password");

  togglePass.addEventListener("click", function() {
    // Toggle password visibility
    const type = passInput.getAttribute("type") === "password" ? "text" : "password";
    passInput.setAttribute("type", type);

    // Toggle button active state (swaps icons)
    this.classList.toggle("active");

    // Update aria-label for accessibility
    const isVisible = type === "text";
    this.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
  });