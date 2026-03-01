import { asyncHandler } from "../utils/asyncHandler.js";


const registerUser = asyncHandler(async (req, res) => {
    res.status(200).json({    
           message: "yes chl gya mja aa gya"
    })
})
   

export { registerUser}