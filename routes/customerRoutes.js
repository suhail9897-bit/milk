// routes/customerRoutes.js
import { Router } from "express";
import customerCtrl from "../controllers/customercontrollers.js";
import { loginCustomer,
         getCustomerMe, 
         getCustomerNotifications,
 } from "../controllers/customercontrollers.js";
// (Optional) If your auth middleware exports a protector, you can add it:
// import auth from "../middleware/auth.js";

const router = Router();

// Seller creates a customer
// If you have auth middleware, prefer:
// router.post("/register", auth, customerCtrl.registerBySeller);
router.post("/register", customerCtrl.registerBySeller);
router.post("/login", loginCustomer);
router.get("/me", getCustomerMe);
router.get("/notifications", getCustomerNotifications);

export default router;
