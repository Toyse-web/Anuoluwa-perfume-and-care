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

   // This is for loading state to login button
  document.getElementById("loginForm").addEventListener("submit", function(e) {
    const btn = document.getElementById("loginBtn");
    const btntext = btn.querySelector(".btn-text");
    const spinner = btn.querySelector(".spinner");

    btn.disabled = true;
    btn.classList.add("loading");
    btntext.textContent = "Logging in...";
    spinner.classList.remove("hidden");
  });

  // Add focus effects
  const inputs = document.querySelectorAll("input");
  inputs.forEach(input => {
    input.addEventListener("focus", function() {
      this.parentElement.classList.add("focused");
    });

    input.addEventListener("blur", function() {
      if (!this.value) {
        this.parentElement.classList.remove("focused");
      }
    });
  });