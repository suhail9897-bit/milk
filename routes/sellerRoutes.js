import { Router } from "express";
import {
  registerSeller,
  loginSeller,
  getMyCustomers,
  setCustomerActiveStatus,
  upsertMilkEntry,          // ⬅️ NEW
  deleteMilkEntry, 
  markLeave,
  deleteCustomer,
  generateMonthlyBill
  
} from "../controllers/sellercontrollers.js";
import auth from "../middleware/auth.js";

const router = Router();

router.post("/register", registerSeller);

router.post("/login", loginSeller);

router.get("/customers", auth, getMyCustomers);
// delete a customer (hard delete)
router.delete("/customer-delete/:id", auth, deleteCustomer);

router.patch("/customers/:id/active", auth, setCustomerActiveStatus);

// ⬇️ NEW: save/update one day’s milk entry
router.post("/customer/:id/milk", auth, upsertMilkEntry);

//delete milk entry
router.delete("/customer/:id/milk/:entryId", auth, deleteMilkEntry);
// leave (create blank entry with empty strings)
router.post("/customer/:id/milk/leave", auth, markLeave);

// ✅ Monthly bill (PDF) – GET /api/seller/customer/:id/bill?month=YYYY-MM
router.get("/customer/:id/bill", auth, generateMonthlyBill);



export default router;
