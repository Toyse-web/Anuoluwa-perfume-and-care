document.addEventListener("click", (e) => {
    if (e.target.matches(".add-to-cart")) {
        const id = e.target.dataset.id;
        alert("Add to cart clicked for product " + id + " (cart not implemented yet)");
        // Later, axios.post("/cart", {productId: id, qty: 1})
    }
});