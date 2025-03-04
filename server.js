// Import required modules
var express = require("express");
var cors = require("cors");
var app = express();
const crypto = require("crypto");
var bodyParser = require("body-parser");
const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");

// ใช้ process.env.PORT สำหรับการทำงานใน Vercel
const PORT = process.env.PORT || 8080;

// Database configuration
const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    database: "ntdtb",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Database connection failed:", err);
    } else {
        console.log("✅ Database connected successfully!");
        connection.release(); // ปล่อย connection กลับไปใน pool
    }
});

const db = pool.promise();

// Middleware configuration
// Configure middleware
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Authentication functions
function generateToken() {
    return crypto.randomBytes(16).toString("hex");
}

// Authentication routes
app.post("/ntdtb/users", async (req, res) => {
    const { Username, Password } = req.body;

    console.log("📩 Received login request:", Username, Password);
    
    if (!Username || !Password) {
        return res.status(400).json({ error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" });
    }

    try {
        // Check user credentials
        const [users] = await db.query(
            "SELECT * FROM user_nt WHERE Username = ? AND Password = ?",
            [Username, Password]
        );

        if (users.length > 0) {
            const user = users[0];
            const accessToken = generateToken();

            // Update user's access token
            await db.query(
                "UPDATE user_nt SET accessToken = ? WHERE User_ID = ?",
                [accessToken, user.User_ID]
            );

            // Return success response
            res.json({
                success: true,
                accessToken,
                user: {
                    User_ID: user.User_ID,
                    Username: user.Username,
                    Name: user.Name,
                    Role_ID: user.Role_ID,
                    Email: user.Email,
                    Tel_Number: user.Tel_Number
                }
            });
        } else {
            res.status(401).json({ 
                success: false,
                error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" 
            });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ 
            success: false,
            error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" 
        });
    }
});

// Utility functions
function generateID(currentMaxID, prefix) {
    if (!currentMaxID) {
        // If no existing ID, start from 1
        return `${prefix}00000001`;
    }
    
    // Extract the numeric part and increment
    const currentNumber = parseInt(currentMaxID.substring(1), 10);
    if (isNaN(currentNumber)) {
        // If parsing fails, start from 1
        return `${prefix}00000001`;
    }
    
    // Increment and pad with zeros
    const nextNumber = currentNumber + 1;
    return `${prefix}${nextNumber.toString().padStart(8, "0")}`;
}

// Add a function to get the next ID for any table
async function getNextID(tableName, idField, prefix) {
    try {
        // Get the maximum ID with direct numeric extraction
        const [result] = await db.query(
            `SELECT MAX(CAST(SUBSTRING(${idField}, 2) AS UNSIGNED)) as maxNum FROM ${tableName}`
        );
        
        // If no results or null, start from 1
        const nextNum = (result[0].maxNum || 0) + 1;
        const newID = `${prefix}${nextNum.toString().padStart(8, '0')}`;
        
        // Verify ID is unique
        const [existing] = await db.query(
            `SELECT ${idField} FROM ${tableName} WHERE ${idField} = ?`,
            [newID]
        );
        
        if (existing.length > 0) {
            throw new Error(`ID ${newID} already exists`);
        }
        
        return newID;
    } catch (error) {
        console.error(`Error in getNextID for ${tableName}:`, error);
        throw error;
    }
}

// Equipment management routes
///////////////////////////////////
// GET - Fetch equipment list with filters
// POST - Create new equipment
// DELETE - Remove equipment
// PUT - Update equipment details
// GET /:id - Get single equipment details
// ...existing equipment routes...

// Import necessary modules (assumed connection already imported)
app.get("/api/equipement", function (req, res) {
    const { Equipe_ID, Equipe_Name, Equipe_Type, Model_Number, Brand } = req.query;

    // Base query with COUNT of items
    let sql = `
        SELECT 
            equipement.*,
            COUNT(item.Item_ID) as ItemCount
        FROM equipement
        LEFT JOIN item ON equipement.Equipe_ID = item.Equipe_ID
    `;

    const conditions = [];
    const values = [];

    // Add search conditions
    if (Equipe_ID) {
        conditions.push("equipement.Equipe_ID LIKE ?");
        values.push(`%${Equipe_ID}%`);
    }
    if (Equipe_Name) {
        conditions.push("equipement.Equipe_Name LIKE ?");
        values.push(`%${Equipe_Name}%`);
    }
    if (Equipe_Type) {
        conditions.push("equipement.Equipe_Type LIKE ?");
        values.push(`%${Equipe_Type}%`);
    }
    if (Model_Number) {
        conditions.push("equipement.Model_Number LIKE ?");
        values.push(`%${Model_Number}%`);
    }
    if (Brand) {
        conditions.push("equipement.Brand LIKE ?");
        values.push(`%${Brand}%`);
    }

    if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Add GROUP BY to get count per equipment
    sql += " GROUP BY equipement.Equipe_ID";

    db.query(sql, values)
        .then(([results]) => {
            res.json({ data: results });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

// app.post("/api/equipment", async function (req, res) {
//     const { User_ID, Equipe_Photo, Equipe_Name, Equipe_Type, Model_Number, Brand } = req.body;
//     const Equipe_CreatDate = req.body.Equipe_CreatDate || new Date().toISOString().slice(0, 19).replace('T', ' ');
//     if (!Equipe_Photo || !Equipe_Photo.startsWith("data:image")) {
//         return res.status(400).json({ message: "รูปภาพไม่ถูกต้อง" });
//     }

//     try {
//         const newEquipeID = await getNextID('equipement', 'Equipe_ID', 'E');

//         await db.query(
//             "INSERT INTO equipement (Equipe_ID, User_ID, Equipe_Photo, Equipe_Name, Equipe_Type, Equipe_CreatDate, Model_Number, Brand) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
//             [newEquipeID, User_ID, Equipe_Photo, Equipe_Name, Equipe_Type, Equipe_CreatDate, Model_Number, Brand]
//         );
//         console.log("Incoming data:", req.body);
//         res.status(201).json({ message: "เพิ่มอุปกรณ์สำเร็จ", Equipe_ID: newEquipeID });
//     } catch (error) {
//         console.error("Error adding new equipment:", error);
//         res.status(500).json({ message: "เกิดข้อผิดพลาดในการเพิ่มอุปกรณ์", error: error.message });
//     }
// });

app.delete("/api/equipment/:Equipe_ID", async (req, res) => {
    const { Equipe_ID } = req.params;

    try {
        const [equipement] = await db.query("SELECT * FROM equipement WHERE Equipe_ID = ?", [Equipe_ID]);

        if (equipement.length === 0) {
            return res.status(404).json({ message: "ไม่พบอุปกรณ์ในระบบ" });
        }

        await db.query("DELETE FROM equipement WHERE Equipe_ID = ?", [Equipe_ID]);

        res.status(200).json({ message: "ลบอุปกรณ์สำเร็จ" });
    } catch (error) {
        console.error("Error deleting equipment:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบอุปกรณ์" });
    }
});

app.put("/api/equipment/:Equipe_ID", function (req, res) {
    const Equipe_ID = req.params.Equipe_ID;
    const {
        Equipe_Photo,
        Equipe_Name,
        Equipe_Type,
        Equipe_CreatDate,
        Model_Number,
        Brand
    } = req.body;

    if (!Equipe_Photo || !Equipe_Name || !Equipe_Type || !Model_Number || !Brand) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    const sql = `
        UPDATE equipement 
        SET Equipe_Photo = ?, Equipe_Name = ?, Equipe_Type = ?, 
            Equipe_CreatDate = ?, Model_Number = ?, Brand = ? 
        WHERE Equipe_ID = ?
    `;
    db.query(
        sql,
        [
            Equipe_Photo,
            Equipe_Name,
            Equipe_Type,
            Equipe_CreatDate,
            Model_Number,
            Brand,
            Equipe_ID,
        ]
    ).then(([results]) => {
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลที่ต้องการแก้ไข" });
        }

        res.json({ message: "แก้ไขข้อมูลสำเร็จ" });
    }).catch(err => {
        console.error("Error updating equipment:", err.message);
        return res.status(500).json({ error: err.message });
    });
});

app.post("/api/equipment", async function (req, res) {
    const { User_ID, Equipe_Photo, Equipe_Name, Equipe_Type, Model_Number, Brand } = req.body;
    const Equipe_CreatDate = req.body.Equipe_CreatDate || new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    if (!Equipe_Photo || !Equipe_Photo.startsWith("data:image")) {
        return res.status(400).json({ message: "รูปภาพไม่ถูกต้อง" });
    }

    try {
        // Check for existing equipment name or model number
        const [existingEquipment] = await db.query(
            "SELECT Equipe_ID, Equipe_Name, Model_Number FROM equipement WHERE Equipe_Name = ? OR Model_Number = ?",
            [Equipe_Name, Model_Number]
        );

        if (existingEquipment.length > 0) {
            if (existingEquipment[0].Equipe_Name === Equipe_Name) {
                return res.status(400).json({
                    message: "มีอุปกรณ์ที่ใช้ชื่อนี้อยู่ในระบบแล้ว"
                });
            } else {
                return res.status(400).json({
                    message: "มีอุปกรณ์ที่ใช้หมายเลขรุ่นนี้อยู่ในระบบแล้ว"
                });
            }
        }

        const newEquipeID = await getNextID('equipement', 'Equipe_ID', 'E');

        await db.query(
            "INSERT INTO equipement (Equipe_ID, User_ID, Equipe_Photo, Equipe_Name, Equipe_Type, Equipe_CreatDate, Model_Number, Brand) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [newEquipeID, User_ID, Equipe_Photo, Equipe_Name, Equipe_Type, Equipe_CreatDate, Model_Number, Brand]
        );
        console.log("Incoming data:", req.body);
        res.status(201).json({ message: "เพิ่มอุปกรณ์สำเร็จ", Equipe_ID: newEquipeID });
    } catch (error) {
        console.error("Error adding new equipment:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการเพิ่มอุปกรณ์", error: error.message });
    }
});

app.put("/api/equipment/:Equipe_ID", async function (req, res) {
    const Equipe_ID = req.params.Equipe_ID;
    const {
        Equipe_Photo,
        Equipe_Name,
        Equipe_Type,
        Equipe_CreatDate,
        Model_Number,
        Brand
    } = req.body;

    if (!Equipe_Photo || !Equipe_Name || !Equipe_Type || !Model_Number || !Brand) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
        // Check for existing equipment name or model number, excluding current equipment
        const [existingEquipment] = await db.query(
            "SELECT Equipe_ID, Equipe_Name, Model_Number FROM equipement WHERE (Equipe_Name = ? OR Model_Number = ?) AND Equipe_ID != ?",
            [Equipe_Name, Model_Number, Equipe_ID]
        );

        if (existingEquipment.length > 0) {
            if (existingEquipment[0].Equipe_Name === Equipe_Name) {
                return res.status(400).json({
                    message: "มีอุปกรณ์ที่ใช้ชื่อนี้อยู่ในระบบแล้ว"
                });
            } else {
                return res.status(400).json({
                    message: "มีอุปกรณ์ที่ใช้หมายเลขรุ่นนี้อยู่ในระบบแล้ว"
                });
            }
        }

        const [result] = await db.query(
            `UPDATE equipement 
             SET Equipe_Photo = ?, Equipe_Name = ?, Equipe_Type = ?, 
                 Equipe_CreatDate = ?, Model_Number = ?, Brand = ? 
             WHERE Equipe_ID = ?`,
            [Equipe_Photo, Equipe_Name, Equipe_Type, Equipe_CreatDate, Model_Number, Brand, Equipe_ID]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลที่ต้องการแก้ไข" });
        }

        res.json({ message: "แก้ไขข้อมูลสำเร็จ" });
    } catch (error) {
        console.error("Error updating equipment:", error);
        return res.status(500).json({ error: error.message });
    }
});

///////////////////////////////////
// Item management routes
///////////////////////////////////
// GET - List all items with filters
// POST - Create new item
// DELETE - Remove item
// PUT - Update item details
// GET /history - Get item history
// ...existing item routes...

app.get('/api/equipement/:id', async (req, res) => {
    const sql = `
        SELECT e.*, i.*
        FROM equipement e
        LEFT JOIN item i ON e.Equipe_ID = i.Equipe_ID
        WHERE e.Equipe_ID = ?
    `;

    db.query(sql, [req.params.id])
        .then(([results]) => {
            if (results.length > 0) {
                res.json(results[0]);
            } else {
                res.status(404).json({ message: 'Equipment not found' });
            }
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

app.get('/api/items/:equipmentId', async (req, res) => {
    const sql = `
        SELECT 
            i.*,
            o.Node_ID,
            o.Room_ID,
            n.Node_Location as Branch_Location,
            n.Node_Name as Building_Name,
            r.Room_Name
        FROM item i
        JOIN object o ON i.Object_ID = o.Object_ID
        JOIN node n ON o.Node_ID = n.Node_ID
        JOIN room r ON o.Room_ID = r.Room_ID
        WHERE i.Equipe_ID = ?
    `;

    db.query(sql, [req.params.equipmentId])
        .then(([results]) => {
            res.json(results);
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

//หาitema
app.get("/api/item", function (req, res) {
    const { Item_ID, Serial_Number, Item_CreateDate, Item_Status } = req.query;

    let conditions = [];
    let values = [];

    if (Item_ID) {
        conditions.push("Item_ID = ?");
        values.push(Item_ID);
    }
    if (Serial_Number) {
        conditions.push("Serial_Number = ?");
        values.push(Serial_Number);
    }
    if (Item_CreateDate) {
        conditions.push("Item_CreateDate = ?");
        values.push(Item_CreateDate);
    }
    if (Item_Status) {
        conditions.push("Item_Status = ?");
        values.push(Item_Status);
    }

    let sql = "SELECT * FROM item";
    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }

    db.query(sql, values)
        .then(([results]) => {
            res.json({ data: results });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

// app.get("/api/objects", function (req, res) {
//     const sql = `
//         SELECT 
//             object.Object_ID, 
//             object.Object_Name, 
//             node.Node_Name, 
//             room.Room_Name
//         FROM object
//         JOIN node ON object.Node_ID = node.Node_ID
//         JOIN room ON object.Room_ID = room.Room_ID
//     `;
//     connection.execute(sql, function (err, results) {
//         if (err) {
//             return res.status(500).json({ error: err.message });
//         }
//         res.json({ data: results });
//     });
// });

//add item
app.post("/api/item", async (req, res) => {
    const { User_ID, Equipe_ID, Serial_Number, Item_CreateDate, Item_Status, Item_Others, Object_ID } = req.body;

    if (!User_ID || !Equipe_ID || !Serial_Number || !Item_CreateDate || !Item_Status || !Item_Others || !Object_ID) {
        console.error("Missing required fields:", req.body); // Log the missing fields
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
        console.log("Received new item data:", req.body); // Log the received data

        // Check if the Object_ID exists in the object table
        const [objectResult] = await db.query("SELECT * FROM object WHERE Object_ID = ?", [Object_ID]);
        if (objectResult.length === 0) {
            return res.status(400).json({ message: "Object_ID ที่ระบุไม่พบในฐานข้อมูล" });
        }

        const newItemID = await getNextID('item', 'Item_ID', 'I');

        await db.query(
            "INSERT INTO item (Item_ID, User_ID, Equipe_ID, Serial_Number, Item_CreateDate, Item_Status, Item_Others, Object_ID) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [newItemID, User_ID, Equipe_ID, Serial_Number, Item_CreateDate, Item_Status, Item_Others, Object_ID]
        );

        res.status(201).json({ message: "เพิ่มอุปกรณ์สำเร็จ", Item_ID: newItemID });
    } catch (error) {
        console.error("Error adding new item:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการเพิ่มอุปกรณ์", error: error.message });
    }
});

//ลบitem
app.delete("/api/item/:Item_ID", async (req, res) => {
    const { Item_ID } = req.params;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // First check if item exists
        const [item] = await connection.query(
            "SELECT * FROM item WHERE Item_ID = ?", 
            [Item_ID]
        );

        if (item.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                message: "ไม่พบอุปกรณ์ในระบบ" 
            });
        }

        // Delete from item_history first
        await connection.query(
            "DELETE FROM item_history WHERE Item_ID = ?",
            [Item_ID]
        );

        // Then delete the item
        await connection.query(
            "DELETE FROM item WHERE Item_ID = ?",
            [Item_ID]
        );

        await connection.commit();
        res.status(200).json({ 
            success: true,
            message: "ลบอุปกรณ์สำเร็จ" 
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error("Error deleting item:", error);
        res.status(500).json({ 
            success: false,
            message: "เกิดข้อผิดพลาดในการลบอุปกรณ์",
            error: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Update the item update endpoint
app.put("/api/item/:Item_ID", async (req, res) => {
    const Item_ID = req.params.Item_ID;
    const {
        Serial_Number,
        Item_CreateDate,
        Item_Status,
        Object_ID,
        Item_Others
    } = req.body;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if Object_ID exists
        const [objectResult] = await connection.query(
            "SELECT * FROM object WHERE Object_ID = ?", 
            [Object_ID]
        );

        if (objectResult.length === 0) {
            await connection.rollback();
            return res.status(400).json({ 
                message: "Object_ID ที่ระบุไม่พบในฐานข้อมูล" 
            });
        }

        // Get current item data
        const [currentItem] = await connection.query(
            "SELECT * FROM item WHERE Item_ID = ?", 
            [Item_ID]
        );
        
        if (currentItem.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                message: "ไม่พบข้อมูลที่ต้องการแก้ไข" 
            });
        }

        // Update item
        await connection.query(
            "UPDATE item SET Serial_Number = ?, Item_CreateDate = ?, Item_Status = ?, Object_ID = ?, Item_Others = ? WHERE Item_ID = ?",
            [Serial_Number, Item_CreateDate, Item_Status, Object_ID, Item_Others, Item_ID]
        );

        // Only create history entry if status changed
        if (currentItem[0].Item_Status !== Item_Status) {
            // Get new StatusID
            const [result] = await connection.query(
                `SELECT MAX(CAST(SUBSTRING(StatusID, 2) AS UNSIGNED)) as maxNum FROM item_history`
            );
            const nextNum = (result[0].maxNum || 0) + 1;
            const newStatusID = `S${nextNum.toString().padStart(8, '0')}`;

            // Insert history record
            await connection.query(
                `INSERT INTO item_history 
                (StatusID, User_ID, Equipe_ID, Item_ID, Object_ID, 
                Item_history_CreateDate, Item_history_Other, Item_history_Status) 
                VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
                [
                    newStatusID,
                    currentItem[0].User_ID,
                    currentItem[0].Equipe_ID,
                    Item_ID,
                    Object_ID,
                    Item_Others,
                    Item_Status
                ]
            );
        }

        await connection.commit();
        res.status(200).json({ message: "แก้ไขข้อมูลสำเร็จ" });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error("Error updating item:", error);
        res.status(500).json({ 
            message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูล", 
            error: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Change status and update item status
app.post("/api/changestatus", async (req, res) => {
    const { User_ID, Equipe_ID, Item_ID, Object_ID, Item_history_CreateDate, Item_history_Other, Item_history_Status } = req.body;

    try {
        // Get new status ID
        const [maxStatusResult] = await db.query(
            `SELECT MAX(CAST(SUBSTRING(StatusID, 2) AS UNSIGNED)) as maxNum FROM item_history`
        );
        const nextNum = (maxStatusResult[0].maxNum || 0) + 1;
        const newStatusID = `S${nextNum.toString().padStart(8, '0')}`;

        // Insert history record
        await db.query(
            `INSERT INTO item_history 
            (StatusID, User_ID, Equipe_ID, Item_ID, Object_ID, 
            Item_history_CreateDate, Item_history_Other, Item_history_Status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newStatusID,
                User_ID,
                Equipe_ID,
                Item_ID,
                Object_ID,
                Item_history_CreateDate,
                Item_history_Other || '',
                Item_history_Status
            ]
        );

        // Update item status
        await db.query(
            "UPDATE item SET Item_Status = ?, Item_Others = ? WHERE Item_ID = ?",
            [Item_history_Status, Item_history_Other || '', Item_ID]
        );

        res.status(201).json({ 
            success: true,
            message: "Status updated successfully",
            statusId: newStatusID 
        });
    } catch (error) {
        console.error("Error in changestatus:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to update status",
            error: error.message 
        });
    }
});

// Fetch item history by item ID
app.get("/api/item/history/:Item_ID", async (req, res) => {
    const { Item_ID } = req.params;

    try {
        const [history] = await db.query("SELECT * FROM item_history WHERE Item_ID = ?", [Item_ID]);
        const detailedHistory = await Promise.all(history.map(async (entry) => {
            const [objectDetails] = await db.query(`
                SELECT n.Node_Location AS Branch_Location, n.Node_Name AS Building_Name, r.Room_Name
                FROM object o
                JOIN node n ON o.Node_ID = n.Node_ID
                JOIN room r ON o.Room_ID = r.Room_ID
                WHERE o.Object_ID = ?
            `, [entry.Object_ID]);
            return { ...entry, ...objectDetails[0] };
        }));
        res.json({ data: detailedHistory });
    } catch (error) {
        console.error("Error fetching item history:", error);
        res.status(500).json({ message: "Error fetching item history" });
    }
});

///////////////////////////////////
// User management routes
///////////////////////////////////
// GET /profile - Get user profile
// GET /users - List all users
// PUT /:id - Update user
// POST - Create new user
// DELETE /:id - Delete user
// ...existing user routes...

//user
app.get("/api/note/user/:userId", async function (req, res) {
    const userId = req.params.userId;
    const sql = `
        SELECT 
            n.*,
            u.Name as author
        FROM note n
        INNER JOIN user_nt u ON n.User_ID = u.User_ID 
        WHERE n.User_ID = ?
    `;

    try {
        const [results] = await db.query(sql, [userId]);
        res.json({ data: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Fix user profile endpoint
app.get("/api/user/profile", async function (req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "No authorization header" });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }

    try {
        const sql = `
            SELECT 
                User_ID,
                Username,
                Password,
                Name,
                Tel_Number as phone,
                Email as email,
                Role_ID
            FROM user_nt 
            WHERE accessToken = ?
        `;
        
        const [results] = await db.query(sql, [token]);
        
        if (results.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // Don't transform the data, send it as is from database
        res.json(results[0]);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/users", function (req, res) {
    const sql = `
        SELECT 
            user_nt.User_ID,
            user_nt.Username,
            user_nt.Name,
            user_nt.Tel_Number as phone,
            user_nt.Email,
            user_nt.Role_ID,
            role.Rolename as RoleName
        FROM user_nt
        LEFT JOIN role ON user_nt.Role_ID = role.Role_ID
    `;

    db.query(sql, [])
        .then(([results]) => {
            res.json({ data: results });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

//แก้ไข  user
app.put("/api/user/:id", async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, username, password, phone, email, roleId } = req.body;

    if (!firstName || !lastName || !username || !password || !phone || !email || !roleId) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
        const sql = `
            UPDATE user_nt 
            SET 
                Username = ?, 
                Password = ?, 
                Name = ?, 
                Tel_Number = ?, 
                Email = ?, 
                Role_ID = ? 
            WHERE User_ID = ?
        `;
        const [result] = await db.query(sql, [username, password, `${firstName} ${lastName}`, phone, email, roleId, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้งานที่ต้องการแก้ไข" });
        }

        res.json({ message: "แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว" });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้งาน" });
    }
});

app.post("/api/users", async function (req, res) {
    const { firstName, lastName, username, password, phone, email, roleId } = req.body;

    if (!firstName || !lastName || !username || !password || !phone || !email || !roleId) {
        console.log("Missing required fields:", req.body);
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
        // Check if the username already exists
        const [existingUser] = await db.query("SELECT * FROM user_nt WHERE Username = ?", [username]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: "ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว" });
        }

        const newUserID = await getNextID('user_nt', 'User_ID', 'U');
        const fullName = `${firstName} ${lastName}`;

        // Insert the new user
        await db.query(
            "INSERT INTO user_nt (User_ID, Username, Password, Name, Tel_Number, Email, Role_ID) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [newUserID, username, password, fullName, phone, email, roleId]
        );

        // Fetch the complete user data including role name
        const [newUserData] = await db.query(`
            SELECT 
                user_nt.User_ID,
                user_nt.Username,
                user_nt.Name,
                user_nt.Tel_Number as phone,
                user_nt.Email,
                user_nt.Role_ID,
                role.Rolename as RoleName
            FROM user_nt
            LEFT JOIN role ON user_nt.Role_ID = role.Role_ID
            WHERE user_nt.User_ID = ?
        `, [newUserID]);

        res.status(201).json({
            message: "เพิ่มผู้ใช้สำเร็จ",
            user: newUserData[0]
        });
    } catch (error) {
        console.error("Error adding new user:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการเพิ่มผู้ใช้", error: error.message });
    }
});

///////////////////////////////////
// Note management routes
///////////////////////////////////
// GET - List all notes
// GET /images/:noteId - Get note images
// POST - Create new note
// PUT /:id - Update note
// DELETE /:id - Delete note
// ...existing note routes...

app.get("/api/note", function (req, res) {
    const sql = `
        SELECT 
            note.Note_ID,
            note.Note_Head,
            note.Note_CreateDate,
            note.Note,
            note.Note_LastModifiedDate,
            user_nt.User_ID,
            user_nt.Name,
            role.Rolename AS RoleName
        FROM note
        LEFT JOIN user_nt ON note.User_ID = user_nt.User_ID
        LEFT JOIN role ON user_nt.Role_ID = role.Role_ID
    `;

    db.query(sql, [])
        .then(([results]) => {
            res.json({ data: results });
        })
        .catch(err => {
            console.error('Database error:', err);
            res.status(500).json({ error: err.message });
        });
});

// Get note images endpoint
app.get("/api/note/images/:noteId", function (req, res) {
    const noteId = req.params.noteId;
    const sql = `
        SELECT Image_ID, Image_Path 
        FROM note_images 
        WHERE Note_ID = ?
        ORDER BY Image_ID
    `;
    
    db.query(sql, [noteId])
        .then(([results]) => {
            res.json({ images: results });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

//post note
app.post("/api/note", async function (req, res) {
    const { User_ID, Note_Head, Note, Note_CreateDate, Note_Images } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Generate new note ID
        const newNoteID = await getNextID('note', 'Note_ID', 'N');
        
        // Insert note
        await connection.query(
            `INSERT INTO note 
            (Note_ID, User_ID, Note_Head, Note, Note_CreateDate, Note_LastModifiedDate) 
            VALUES (?, ?, ?, ?, ?, NOW())`,
            [newNoteID, User_ID, Note_Head, Note, Note_CreateDate]
        );

        // Insert images if any
        if (Note_Images && Note_Images.length > 0) {
            for (const imagePath of Note_Images) {
                const [maxImageResult] = await connection.query(
                    "SELECT MAX(CAST(SUBSTRING(Image_ID, 2) AS UNSIGNED)) as maxNum FROM note_images"
                );
                const nextNum = (maxImageResult[0].maxNum || 0) + 1;
                const newImageID = `I${nextNum.toString().padStart(8, '0')}`;
                
                await connection.query(
                    "INSERT INTO note_images (Image_ID, Note_ID, Image_Path) VALUES (?, ?, ?)",
                    [newImageID, newNoteID, imagePath]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ 
            success: true,
            message: "Note created successfully", 
            Note_ID: newNoteID 
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error("Error creating note:", error);
        res.status(500).json({ 
            success: false,
            message: "Error creating note", 
            error: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

//delete note
app.delete("/api/note/:Note_ID", async (req, res) => {
    const { Note_ID } = req.params;

    try {
        const [note] = await db.query("SELECT * FROM note WHERE Note_ID = ?", [Note_ID]);

        if (note.length === 0) {
            return res.status(404).json({ message: "ไม่พบบันทึกในระบบ" });
        }

        // First delete related images
        const [images] = await db.query("SELECT Image_Path FROM note_images WHERE Note_ID = ?", [Note_ID]);
        for (const image of images) {
            const imagePath = path.join(__dirname, image.Image_Path);
            fs.unlink(imagePath, (err) => {
                if (err) {
                    console.error(`Error deleting image file: ${imagePath}`, err);
                }
            });
        }
        await db.query("DELETE FROM note_images WHERE Note_ID = ?", [Note_ID]);
        
        // Then delete the note
        await db.query("DELETE FROM note WHERE Note_ID = ?", [Note_ID]);

        res.status(200).json({ message: "ลบบันทึกสำเร็จ" });
    } catch (error) {
        console.error("Error deleting note:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบบันทึก" });
    }
});

app.get("/api/objects", function (req, res) {
    const { Object_Name, Node_Name, Room_Name, Floor_Name, page = 1 } = req.query;

    const itemsPerPage = 5;
    const offset = (page - 1) * itemsPerPage;

    let conditions = [];
    let values = [];

    if (Node_Name) {
        conditions.push("node.Node_Name LIKE ?");
        values.push(`%${Node_Name}%`);
    }
    if (Room_Name) {
        conditions.push("room.Room_Name LIKE ?");
        values.push(`%${Room_Name}%`);
    }
    if (Floor_Name) {
        conditions.push("room.Room_Floor LIKE ?");
        values.push(`%${Floor_Name}%`);
    }
    if (Object_Name) {
        conditions.push("object.Object_Name LIKE ?");
        values.push(`%${Object_Name}%`);
    }

    let sql = `
        SELECT 
            object.Object_ID, 
            object.Object_Name, 
            node.Node_Name, 
            room.Room_Name, 
            room.Room_Floor,
            item.Item_ID,
            item.Serial_Number,
            item.Item_Status,
            item.Item_CreateDate,
            item.Item_Others
        FROM object
        JOIN node ON object.Node_ID = node.Node_ID
        JOIN room ON object.Room_ID = room.Room_ID
        INNER JOIN item ON object.Object_ID = item.Object_ID  -- ใช้ INNER JOIN เพื่อดึงแค่ object ที่มี item
    `;

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " LIMIT ? OFFSET ?";
    values.push(itemsPerPage, offset);

    db.query(sql, values)
        .then(([results]) => {
            res.json({ data: results });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

///////////////////////////////////
// Room management routes
///////////////////////////////////
// GET - List all rooms
// GET /search - Search rooms
// GET /suggestions - Get room suggestions
// DELETE /node/:nodeId - Delete node
// DELETE /room/:roomId - Delete room
// PUT /node/:nodeId - Update node
// PUT /room/:roomId - Update room
// ...existing room routes...

app.listen(PORT, function () {
    console.log(`Server is running on port ${PORT}`);
});

app.get("/api/mynotes", function (req, res) {
    const token = req.headers.authorization?.split(' ')[1];
    
    const userSql = "SELECT User_ID FROM user_nt WHERE accessToken = ?";
    
    db.query(userSql, [token])
        .then(([userResults]) => {
            if (userResults.length === 0) {
                return res.status(401).json({ error: "Unauthorized" });
            }
            
            const userId = userResults[0].User_ID;
            
            const noteSql = `
                SELECT 
                    note.Note_ID,
                    note.Note_Head,
                    note.Note,
                    note.Note_CreateDate,
                    note.Note_Photo,
                    user_nt.Name as author
                FROM note
                INNER JOIN user_nt ON note.User_ID = user_nt.User_ID
                WHERE note.User_ID = ?
            `;
            
            return db.query(noteSql, [userId]);
        })
        .then(([noteResults]) => {
            res.json({ data: noteResults });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

// Add this new endpoint after your existing routes

app.get("/api/device-summary", async (req, res) => {
    try {
        // Get total count of items
        const [totalResult] = await db.query(
            'SELECT COUNT(*) as count FROM item'
        );
        
        // Get active items count - modified to check for "ใช้งานได้" status
        const [activeResult] = await db.query(
            'SELECT COUNT(*) as count FROM item WHERE Item_Status = "active"'
        );

        // Get inactive items count - modified to check for other statuses
        const [inactiveResult] = await db.query(
            'SELECT COUNT(*) as count FROM item WHERE Item_Status != "active"'
        );

        // Rest of the code remains the same...
        const [typeResult] = await db.query(
            'SELECT COUNT(DISTINCT Equipe_Type) as count FROM equipement'
        );

        const [brandResult] = await db.query(
            'SELECT COUNT(DISTINCT Brand) as count FROM equipement'
        );

        const [brandDistribution] = await db.query(`
            SELECT 
                e.Brand as brand,
                COUNT(i.Item_ID) as count
            FROM equipement e
            LEFT JOIN item i ON e.Equipe_ID = i.Equipe_ID
            GROUP BY e.Brand
            ORDER BY count DESC
        `);

        res.json({
            totalCount: totalResult[0].count,
            activeCount: activeResult[0].count,
            inactiveCount: inactiveResult[0].count,
            typeCount: typeResult[0].count,
            brandCount: brandResult[0].count,
            brandDistribution: brandDistribution
        });

    } catch (error) {
        console.error('Error fetching device summary:', error);
        res.status(500).json({ error: 'Failed to fetch device summary' });
    }
});

app.delete("/api/note/:Note_ID", async (req, res) => {
    const { Note_ID } = req.params;

    try {
        const [note] = await db.query("SELECT * FROM note WHERE Note_ID = ?", [Note_ID]);

        if (note.length === 0) {
            return res.status(404).json({ message: "ไม่พบบันทึกในระบบ" });
        }

        // First delete related images
        await db.query("DELETE FROM note_images WHERE Note_ID = ?", [Note_ID]);
        
        // Then delete the note
        await db.query("DELETE FROM note WHERE Note_ID = ?", [Note_ID]);

        res.status(200).json({ message: "ลบบันทึกสำเร็จ" });
    } catch (error) {
        console.error("Error deleting note:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบบันทึก" });
    }
});
    
app.get("/api/rooms", async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        
        // Add error handling for the query
        const [results] = await connection.query(`
            SELECT 
                node.Node_ID as node_id,
                room.Room_ID as room_id,
                node.Node_Location as branch_number,
                node.Node_Name as branch_name,
                node.Node_Building as building_name,
                room.Room_Floor as floor,
                room.Room_Name as room_name,
                COUNT(DISTINCT item.Item_ID) as item_count
            FROM node 
            LEFT JOIN room ON node.Node_ID = room.Node_ID
            LEFT JOIN object ON room.Room_ID = object.Room_ID
            LEFT JOIN item ON object.Object_ID = item.Object_ID
            GROUP BY node.Node_ID, room.Room_ID
        `).catch(err => {
            console.error("Query error:", err);
            throw new Error("Database query failed");
        });
        
        // Ensure we always return a valid JSON response
        res.json({ 
            success: true,
            data: results || [],
            message: "Data retrieved successfully"
        });
    } catch (error) {
        console.error("Error fetching rooms:", error);
        res.status(500).json({ 
            success: false,
            data: [],
            message: "เกิดข้อผิดพลาดในการดึงข้อมูลห้อง",
            error: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get("/api/rooms/search", async (req, res) => {
    const { branch_number, branch_name, building, floor, room } = req.query;
    
    try {
        let sql = `
            SELECT 
                node.Node_Location as branch_number,
                node.Node_Name as branch_name,
                node.Node_Building as building_name,
                room.Room_Floor as floor,
                room.Room_Name as room_name,
                COUNT(DISTINCT item.Item_ID) as item_count
            FROM node
            LEFT JOIN room ON node.Node_ID = room.Node_ID
            LEFT JOIN object ON room.Room_ID = object.Room_ID
            LEFT JOIN item ON object.Object_ID = item.Object_ID
            WHERE 1=1
        `;
        
        const values = [];
        
        if (branch_number) {
            sql += " AND node.Node_Location LIKE ?";
            values.push(`%${branch_number}%`);
        }
        if (branch_name) {
            sql += " AND node.Node_Name LIKE ?";
            values.push(`%${branch_name}%`);
        }
        if (building) {
            sql += " AND node.Node_Building LIKE ?";
            values.push(`%${building}%`);
        }
        if (floor) {
            sql += " AND room.Room_Floor LIKE ?";
            values.push(`%${floor}%`);
        }
        if (room) {
            sql += " AND room.Room_Name LIKE ?";
            values.push(`%${room}%`);
        }
        
        sql += " GROUP BY node.Node_ID, room.Room_ID";

        const [results] = await db.query(sql, values);
        res.json({ data: results });
    } catch (error) {
        console.error("Error searching rooms:", error);
        res.status(500).json({ 
            message: "เกิดข้อผิดพลาดในการค้นหาห้อง",
            error: error.message 
        });
    }
});

app.get("/api/rooms/suggestions", async (req, res) => {
    const { type, search } = req.query;
    
    try {
        let sql = '';
        switch(type) {
            case 'branch_number':
                sql = "SELECT DISTINCT Node_Location FROM node WHERE Node_Location LIKE ? LIMIT 5";
                break;
            case 'branch_name':
                sql = "SELECT DISTINCT Node_Name FROM node WHERE Node_Name LIKE ? LIMIT 5";
                break;
            case 'floor':
                sql = "SELECT DISTINCT Room_Floor FROM room WHERE Room_Floor LIKE ? LIMIT 5";
                break;
            case 'room':
                sql = "SELECT DISTINCT Room_Name FROM room WHERE Room_Name LIKE ? LIMIT 5";
                break;
            default:
                return res.json({ suggestions: [] });
        }

        const [results] = await db.query(sql, [`%${search}%`]);
        const suggestions = results.map(row => Object.values(row)[0]);
        res.json({ suggestions });
    } catch (error) {
        console.error("Error fetching suggestions:", error);
        res.status(500).json({ 
            message: "เกิดข้อผิดพลาดในการดึงคำแนะนำ",
            error: error.message 
        });
    }
});

// Delete node endpoint - update to handle empty objects
app.delete("/api/rooms/node/:nodeId", async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if node exists
        const [node] = await connection.query(
            "SELECT * FROM node WHERE Node_ID = ?", 
            [req.params.nodeId]
        );

        if (node.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "ไม่พบสาขาที่ระบุในระบบ" });
        }

        // Check for items in any objects in any rooms of this node
        const [items] = await connection.query(`
            SELECT i.* 
            FROM item i
            JOIN object o ON i.Object_ID = o.Object_ID
            JOIN room r ON o.Room_ID = r.Room_ID
            WHERE r.Node_ID = ?`,
            [req.params.nodeId]
        );

        if (items.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: "ไม่สามารถลบสาขาได้เนื่องจากมีอุปกรณ์อยู่ในสาขา" });
        }

        // Delete objects in all rooms of this node
        await connection.query(
            "DELETE o FROM object o JOIN room r ON o.Room_ID = r.Room_ID WHERE r.Node_ID = ?",
            [req.params.nodeId]
        );

        // Delete all rooms in this node
        await connection.query(
            "DELETE FROM room WHERE Node_ID = ?",
            [req.params.nodeId]
        );

        // Finally delete the node
        await connection.query(
            "DELETE FROM node WHERE Node_ID = ?",
            [req.params.nodeId]
        );

        await connection.commit();
        res.json({ message: "ลบสาขาและข้อมูลที่เกี่ยวข้องเรียบร้อยแล้ว" });

    } catch (error) {
        console.error("Error deleting node:", error);
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบข้อมูล" });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Delete room endpoint - update to handle empty objects
app.delete("/api/rooms/room/:roomId", async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if room exists
        const [room] = await connection.query(
            "SELECT * FROM room WHERE Room_ID = ?", 
            [req.params.roomId]
        );
        
        if (room.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "ไม่พบห้องที่ระบุในระบบ" });
        }

        // Check for items in any objects in this room
        const [itemsInRoom] = await connection.query(
            `SELECT i.* 
             FROM item i
             JOIN object o ON i.Object_ID = o.Object_ID 
             WHERE o.Room_ID = ?`,
            [req.params.roomId]
        );

        if (itemsInRoom.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: "ไม่สามารถลบห้องได้เนื่องจากมีอุปกรณ์อยู่ในห้อง" });
        }

        // Delete all objects in this room
        await connection.query(
            "DELETE FROM object WHERE Room_ID = ?",
            [req.params.roomId]
        );

        // Delete the room
        await connection.query(
            "DELETE FROM room WHERE Room_ID = ?",
            [req.params.roomId]
        );
        
        await connection.commit();
        res.json({ message: "ลบห้องและพื้นที่ว่างเรียบร้อยแล้ว" });

    } catch (error) {
        console.error("Error deleting room:", error);
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบข้อมูล" });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.put("/api/rooms/node/:nodeId", async (req, res) => {
    const { Node_Name, Node_Location, Node_Building } = req.body;
    try {
        await db.query(
            "UPDATE node SET Node_Name = ?, Node_Location = ?, Node_Building = ? WHERE Node_ID = ?",
            [Node_Name, Node_Location, Node_Building, req.params.nodeId]
        );
        res.json({ message: "อัพเดทข้อมูลสาขาเรียบร้อย" });
    } catch (error) {
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัพเดทข้อมูล" });
    }
});

app.put("/api/rooms/room/:roomId", async (req, res) => {
    const { Room_Floor, Room_Name } = req.body;
    try {
        await db.query(
            "UPDATE room SET Room_Floor = ?, Room_Name = ? WHERE Room_ID = ?",
            [Room_Floor, Room_Name, req.params.roomId]
        );
        res.json({ message: "อัพเดทข้อมูลห้องเรียบร้อย" });
    } catch (error) {
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัพเดทข้อมูล" });
    }
});

///////////////////////////////////
// Image handling routes
///////////////////////////////////
// POST /upload-chunk - Handle image uploads
// Serve static files from uploads directory
// ...existing image handling code...

// Consolidate image upload handling
const handleImageUpload = (imageId, chunk, chunkIndex, totalChunks) => {
    return new Promise((resolve, reject) => {
        const imagePath = path.join(__dirname, "uploads", imageId);
        const buffer = Buffer.from(chunk, "base64");

        fs.appendFile(imagePath, buffer, (err) => {
            if (err) {
                reject(err);
                return;
            }

            if (chunkIndex === totalChunks - 1) {
                const finalImagePath = `${imagePath}.jpg`;
                fs.rename(imagePath, finalImagePath, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(finalImagePath);
                });
            } else {
                resolve(null);
            }
        });
    });
};

app.post("/api/upload-chunk", async (req, res) => {
    try {
        const { imageId, chunk, chunkIndex, totalChunks } = req.body;
        const result = await handleImageUpload(imageId, chunk, chunkIndex, totalChunks);
        if (result) {
            res.status(200).json({ message: "Image uploaded successfully", imagePath: result });
        } else {
            res.status(200).json({ message: "Chunk uploaded successfully" });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to upload image" });
    }
});

// Serve static files from the "uploads" directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post("/api/note", async function (req, res) {
    const { User_ID, Note_Head, Note, Note_CreateDate, Note_Images } = req.body;

    try {
        const newNoteID = await getNextID('note', 'Note_ID', 'N');
        
        await db.query(
            "INSERT INTO note (Note_ID, User_ID, Note_Head, Note, Note_CreateDate) VALUES (?, ?, ?, ?, ?)",
            [newNoteID, User_ID, Note_Head, Note, Note_CreateDate]
        );

        // Insert images if any
        if (Note_Images && Note_Images.length > 0) {
            for (const imagePath of Note_Images) {
                const [maxImageResult] = await db.query("SELECT MAX(Image_ID) AS maxImageID FROM note_images");
                const newImageID = generateID(maxImageResult[0]?.maxImageID, "I");
                await db.query(
                    "INSERT INTO note_images (Image_ID, Note_ID, Image_Path) VALUES (?, ?, ?)",
                    [newImageID, newNoteID, imagePath]
                );
            }
        }

        res.status(201).json({ message: "Note created successfully", Note_ID: newNoteID });
    } catch (error) {
        console.error("Error creating note:", error);
        res.status(500).json({ message: "Error creating note", error: error.message });
    }
});

// Serve static files from the "uploads" directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Add this new endpoint after your existing routes

app.get("/api/roles", function (req, res) {
    const sql = "SELECT Role_ID, Rolename FROM role";
    db.query(sql, [])
        .then(([results]) => {
            res.json({ data: results });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

app.delete("/api/user/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const [user] = await db.query("SELECT * FROM user_nt WHERE User_ID = ?", [id]);

        if (user.length === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้งานในระบบ" });
        }

        await db.query("DELETE FROM user_nt WHERE User_ID = ?", [id]);

        res.status(200).json({ message: "ลบผู้ใช้งานสำเร็จ" });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบผู้ใช้งาน" });
    }
});

app.put("/api/user/:id", async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, username, password, phone, email, roleId } = req.body;

    if (!firstName || !lastName || !username || !password || !phone || !email || !roleId) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
        const sql = `
            UPDATE user_nt 
            SET 
                Username = ?, 
                Password = ?, 
                Name = ?, 
                Tel_Number = ?, 
                Email = ?, 
                Role_ID = ? 
            WHERE User_ID = ?
        `;
        const [result] = await db.query(sql, [username, password, `${firstName} ${lastName}`, phone, email, roleId, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้งานที่ต้องการแก้ไข" });
        }

        res.json({ message: "แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว" });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้งาน" });
    }
});

// Fix profile update endpoint
app.put("/api/user/profile/update", async (req, res) => {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const { username, name, email, phone, password } = req.body;

    if (!accessToken) {
        return res.status(401).json({ message: "No authorization token provided" });
    }

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // First get the current user data
            const [currentUser] = await connection.query(
                "SELECT * FROM user_nt WHERE accessToken = ?",
                [accessToken]
            );

            if (currentUser.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: "User not found" });
            }

            // Check if new username is already taken by another user
            if (username !== currentUser[0].Username) {
                const [existingUser] = await connection.query(
                    "SELECT User_ID FROM user_nt WHERE Username = ? AND User_ID != ?",
                    [username, currentUser[0].User_ID]
                );

                if (existingUser.length > 0) {
                    await connection.rollback();
                    return res.status(400).json({ message: "Username already taken" });
                }
            }

            // Update user data
            const updateSQL = `
                UPDATE user_nt 
                SET 
                    Username = ?,
                    Name = ?,
                    Email = ?,
                    Tel_Number = ?
                    ${password ? ', Password = ?' : ''}
                WHERE accessToken = ?
            `;

            const updateParams = password 
                ? [username, name, email, phone, password, accessToken]
                : [username, name, email, phone, accessToken];

            await connection.query(updateSQL, updateParams);

            // Get updated user data
            const [updatedUser] = await connection.query(
                "SELECT User_ID, Username, Name, Email, Tel_Number as phone FROM user_nt WHERE accessToken = ?",
                [accessToken]
            );

            await connection.commit();

            res.json({ 
                success: true,
                message: "Profile updated successfully",
                data: updatedUser[0]
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to update profile",
            error: error.message
        });
    }
});

app.get("/api/equipment/search", function (req, res) {
    const { Serial_Number, Node_Name, Room_Name, Object_Name, Item_Status } = req.query;

    let conditions = [];
    let values = [];

    if (Serial_Number) {
        conditions.push("item.Serial_Number LIKE ?");
        values.push(`%${Serial_Number}%`);
    }
    if (Node_Name) {
        conditions.push("node.Node_Name LIKE ?");
        values.push(`%${Node_Name}%`);
    }
    if (Room_Name) {
        conditions.push("room.Room_Name LIKE ?");
        values.push(`%${Room_Name}%`);
    }
    if (Object_Name) {
        conditions.push("object.Object_Name LIKE ?");
        values.push(`%${Object_Name}%`);
    }
    if (Item_Status) {
        conditions.push("item.Item_Status = ?");
        values.push(Item_Status);
    }

    let sql = `
        SELECT 
            item.*,
            node.Node_Location as Branch_Location,
            node.Node_Name as Building_Name,
            room.Room_Name
        FROM item
        JOIN object ON item.Object_ID = object.Object_ID
        JOIN node ON object.Node_ID = node.Node_ID
        JOIN room ON object.Room_ID = room.Room_ID
    `;
    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }

    db.query(sql, values)
        .then(([results]) => {
            res.json({ data: results });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

app.get("/api/equipment/suggestions", function (req, res) {
    const { type, search } = req.query;
    
    if (!type || !search) {
        return res.status(400).json({ suggestions: [] });
    }

    let sql = '';
    switch(type) {
        case 'Serial_Number':
            sql = `
                SELECT DISTINCT Serial_Number as suggestion 
                FROM item 
                WHERE Serial_Number LIKE ? 
                LIMIT 5
            `;
            break;
        case 'Node_Name':
            sql = `
                SELECT DISTINCT Node_Name as suggestion
                FROM node 
                WHERE Node_Name LIKE ? 
                LIMIT 5
            `;
            break;
        case 'Room_Name':
            sql = `
                SELECT DISTINCT Room_Name as suggestion
                FROM room 
                WHERE Room_Name LIKE ? 
                LIMIT 5
            `;
            break;
        case 'Object_Name':
            sql = `
                SELECT DISTINCT Object_Name as suggestion
                FROM object 
                WHERE Object_Name LIKE ? 
                LIMIT 5
            `;
            break;
        default:
            return res.json({ suggestions: [] });
    }

    db.query(sql, [`%${search}%`])
        .then(([results]) => {
            const suggestions = results.map(row => row.suggestion);
            res.json({ suggestions });
        })
        .catch(err => {
            res.status(500).json({ suggestions: [] });
        });
});

// Fetch all nodes
app.get("/api/nodes", async (req, res) => {
    try {
        const [nodes] = await db.query("SELECT Node_ID, Node_Name, Node_Location, Node_Building FROM node");
        res.json({ data: nodes });
    } catch (error) {
        console.error("Error fetching nodes:", error);
        res.status(500).json({ message: "Error fetching nodes" });
    }
});

// Fetch rooms by node ID
app.get("/api/rooms/:nodeId", async (req, res) => {
    const { nodeId } = req.params;
    try {
        const [rooms] = await db.query("SELECT Room_ID, Room_Floor, Room_Name FROM room WHERE Node_ID = ?", [nodeId]);
        res.json({ data: rooms });
    } catch (error) {
        console.error("Error fetching rooms:", error);
        res.status(500).json({ message: "Error fetching rooms" });
    }
});

// Updated GET objects by room ID endpoint
app.get("/api/objects/:roomId", async (req, res) => {
    try {
        const sql = `
            SELECT 
                o.Object_ID,
                o.Object_Name,
                o.Object_Type,
                o.Object_Others,
                COUNT(i.Item_ID) as item_count
            FROM object o
            LEFT JOIN item i ON o.Object_ID = i.Object_ID
            WHERE o.Room_ID = ?
            GROUP BY o.Object_ID, o.Object_Name, o.Object_Type, o.Object_Others
        `;
        const [objects] = await db.query(sql, [req.params.roomId]);
        res.json(objects);
    } catch (error) {
        console.error("Error fetching objects:", error);
        res.status(500).json({ message: "Error fetching objects", error: error.message });
    }
});

// Fetch objects by room ID
app.get("/api/objects/:roomId", async (req, res) => {
    const { roomId } = req.params;
    try {
        const [objects] = await db.query("SELECT Object_ID, Object_Name, Object_Photo, Object_Others, Object_Type FROM object WHERE Room_ID = ?", [roomId]);
        res.json({ data: objects });
    } catch (error) {
        console.error("Error fetching objects:", error);
        res.status(500).json({ message: "Error fetching objects" });
    }
});

// Add new item
app.post("/api/item", async (req, res) => {
    const { User_ID, Equipe_ID, Serial_Number, Item_Status, Object_ID, Item_Others } = req.body;
    const Item_CreateDate = new Date().toISOString().slice(0, 10);

    if (!User_ID || !Equipe_ID || !Serial_Number || !Item_Status || !Object_ID || !Item_Others) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    try {
        const newItemID = await getNextID('item', 'Item_ID', 'I');

        await db.query(
            "INSERT INTO item (Item_ID, User_ID, Equipe_ID, Serial_Number, Item_CreateDate, Item_Status, Object_ID, Item_Others) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [newItemID, User_ID, Equipe_ID, Serial_Number, Item_CreateDate, Item_Status, Object_ID, Item_Others]
        );

        res.status(201).json({ message: "เพิ่มอุปกรณ์สำเร็จ", Item_ID: newItemID });
    } catch (error) {
        console.error("Error adding new item:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการเพิ่มอุปกรณ์", error: error.message });
    }
});

app.put("/api/note/:Note_ID", async (req, res) => {
    const { Note_ID } = req.params;
    const { User_ID, Note_Head, Note, Note_CreateDate, Note_Images } = req.body;

    try {
        // Update note
        await db.query(
            "UPDATE note SET User_ID = ?, Note_Head = ?, Note = ?, Note_CreateDate = ? WHERE Note_ID = ?",
            [User_ID, Note_Head, Note, Note_CreateDate, Note_ID]
        );

        // Delete existing images
        await db.query("DELETE FROM note_images WHERE Note_ID = ?", [Note_ID]);

        // Insert new images if any
        if (Note_Images && Note_Images.length > 0) {
            for (const imagePath of Note_Images) {
                const [maxImageResult] = await db.query("SELECT MAX(Image_ID) AS maxImageID FROM note_images");
                const newImageID = generateID(maxImageResult[0]?.maxImageID, "I");
                await db.query(
                    "INSERT INTO note_images (Image_ID, Note_ID, Image_Path) VALUES (?, ?, ?)",
                    [newImageID, Note_ID, imagePath]
                );
            }
        }

        res.status(200).json({ message: "Note updated successfully" });
    } catch (error) {
        console.error("Error updating note:", error);
        res.status(500).json({ message: "Error updating note", error: error.message });
    }
});

app.get("/api/object-details", async (req, res) => {
    try {
        const sql = `
            SELECT 
                object.Object_ID, 
                object.Node_ID, 
                object.Room_ID,
                node.Node_Name,
                room.Room_Name
            FROM object
            JOIN node ON object.Node_ID = node.Node_ID
            JOIN room ON object.Room_ID = room.Room_ID
        `;
        const [results] = await db.query(sql);
        res.json({ data: results });
    } catch (error) {
        console.error("Error fetching object details:", error);
        res.status(500).json({ message: "Error fetching object details" });
    }
});

app.get("/api/equipment-by-node", async (req, res) => {
  try {
    const sql = `
      SELECT 
        n.Node_Name, 
        COUNT(e.Equipe_ID) as EquipmentCount
      FROM node n
      LEFT JOIN object o ON n.Node_ID = o.Node_ID
      LEFT JOIN item i ON o.Object_ID = i.Object_ID
      LEFT JOIN equipement e ON i.Equipe_ID = e.Equipe_ID
      GROUP BY n.Node_Name
    `;
    const [results] = await db.query(sql);
    res.json(results);
  } catch (error) {
    console.error("Error fetching equipment by node:", error);
    res.status(500).json({ message: "Error fetching equipment by node" });
  }
});

// เพิ่ม endpoint สำหรับดึงข้อมูลกิจกรรมล่าสุด
app.get("/api/recent-activities", async (req, res) => {
  try {
    const sql = `
      SELECT 
        'note' as type,
        CONCAT('New note: ', note.Note_Head) as title,
        note.Note_CreateDate as timestamp
      FROM note
      UNION ALL
      SELECT 
        'item' as type,
        CONCAT('Item status changed: ', item.Serial_Number) as title,
        item.Item_CreateDate as timestamp
      FROM item
      ORDER BY timestamp DESC
      LIMIT 10
    `;
    
    const [results] = await db.query(sql);
    res.json(results);
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ error: 'Failed to fetch recent activities' });
  }
});

// New room management endpoints
app.post("/api/rooms/node", async (req, res) => {
    const { name, location, building } = req.body;
    
    console.log("Received node creation request:", req.body);

    if (!name || !location) {
        return res.status(400).json({ 
            message: "ต้องระบุทั้งชื่อสาขาและเลขสาขา" 
        });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check for existing node name or location
        const [existingNode] = await connection.query(
            "SELECT Node_ID, Node_Name, Node_Location FROM node WHERE Node_Name = ? OR Node_Location = ?",
            [name, location]
        );

        if (existingNode.length > 0) {
            await connection.rollback();
            // Provide specific message about what is duplicated
            if (existingNode[0].Node_Name === name) {
                return res.status(400).json({
                    message: "มีสาขาที่ใช้ชื่อนี้อยู่ในระบบแล้ว"
                });
            } else {
                return res.status(400).json({
                    message: "มีสาขาที่ใช้เลขสาขานี้อยู่ในระบบแล้ว"
                });
            }
        }

        // Get new node ID
        const [result] = await connection.query(
            `SELECT MAX(CAST(SUBSTRING(Node_ID, 2) AS UNSIGNED)) as maxNum FROM node`
        );
        const nextNum = (result[0].maxNum || 0) + 1;
        const newNodeID = `N${nextNum.toString().padStart(8, '0')}`;

        // Insert new node - now including Node_Building
        await connection.query(
            "INSERT INTO node (Node_ID, Node_Name, Node_Location, Node_Building) VALUES (?, ?, ?, ?)",
            [newNodeID, name, location, building || ''] // Use empty string if building is not provided
        );

        await connection.commit();
        console.log("Node created successfully:", { id: newNodeID, name, location, building });

        res.status(201).json({ 
            message: "สร้างสาขาใหม่สำเร็จ", 
            node: { 
                id: newNodeID, 
                name, 
                location,
                building 
            } 
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error("Error creating node:", error);
        res.status(500).json({ 
            message: "เกิดข้อผิดพลาดในการสร้างสาขา",
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Update the room creation endpoint to check for duplicate names within the same node
app.post("/api/rooms/room", async (req, res) => {
    const { floor, name, building, nodeId } = req.body;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if node exists
        const [nodeExists] = await connection.query(
            "SELECT Node_ID FROM node WHERE Node_ID = ?", 
            [nodeId]
        );

        if (nodeExists.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                message: "ไม่พบสาขาที่ระบุในระบบ" 
            });
        }

        // Check for existing room name in the same node
        const [existingRoom] = await connection.query(
            "SELECT Room_ID FROM room WHERE Node_ID = ? AND Room_Name = ?",
            [nodeId, name]
        );

        if (existingRoom.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                message: "มีห้องที่ใช้ชื่อนี้อยู่ในสาขานี้แล้ว"
            });
        }

        // Generate new room ID
        const [roomResult] = await connection.query(
            `SELECT MAX(CAST(SUBSTRING(Room_ID, 2) AS UNSIGNED)) as maxNum FROM room`
        );
        const nextRoomNum = (roomResult[0].maxNum || 0) + 1;
        const newRoomID = `R${nextRoomNum.toString().padStart(8, '0')}`;

        // Insert new room
        await connection.query(
            "INSERT INTO room (Room_ID, Node_ID, Room_Floor, Room_Name) VALUES (?, ?, ?, ?)",
            [newRoomID, nodeId, floor, name]
        );

        // Generate new object ID for empty space
        const [objectResult] = await connection.query(
            `SELECT MAX(CAST(SUBSTRING(Object_ID, 4) AS UNSIGNED)) as maxNum FROM object`
        );
        const nextObjectNum = (objectResult[0].maxNum || 0) + 1;
        const newObjectID = `OBJ${nextObjectNum.toString().padStart(5, '0')}`;

        // Create empty space object
        await connection.query(
            `INSERT INTO object (Object_ID, Node_ID, Room_ID, Object_Name, Object_Type, Object_Others) 
             VALUES (?, ?, ?, 'Empty Space', 'Empty', 'Automatically created empty space')`,
            [newObjectID, nodeId, newRoomID]
        );

        await connection.commit();

        res.status(201).json({ 
            message: "สร้างห้องและพื้นที่ว่างเรียบร้อยแล้ว",
            room: { 
                id: newRoomID, 
                nodeId,
                floor, 
                name
            },
            object: {
                id: newObjectID
            }
        });

    } catch (error) {
        console.error("Error creating room and empty space:", error);
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({ 
            message: "เกิดข้อผิดพลาดในการสร้างห้องและพื้นที่ว่าง",
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get("/api/rooms/nodes", async (req, res) => {
    try {
        const [nodes] = await db.query("SELECT Node_ID as id, Node_Name as name, Node_Location as location FROM node");
        res.json({ nodes });
    } catch (error) {
        console.error("Error fetching nodes:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลสาขา" });
    }
});

app.get("/api/rooms/nodes/search", async (req, res) => {
    const { search } = req.query;
    try {
        const [nodes] = await db.query(`
            SELECT 
                Node_ID as id,
                Node_Name as name,
                Node_Location as location,
                (
                    CASE 
                        WHEN Node_Name LIKE ? THEN 3
                        WHEN Node_Name LIKE ? THEN 2
                        WHEN Node_Name LIKE ? THEN 1
                        ELSE 0
                    END +
                    CASE 
                        WHEN Node_Location LIKE ? THEN 3
                        WHEN Node_Location LIKE ? THEN 2
                        WHEN Node_Location LIKE ? THEN 1
                        ELSE 0
                    END
                ) as relevance
            FROM node
            WHERE 
                Node_Name LIKE ? OR
                Node_Name LIKE ? OR
                Node_Name LIKE ? OR
                Node_Location LIKE ? OR
                Node_Location LIKE ? OR
                Node_Location LIKE ?
            ORDER BY relevance DESC
            LIMIT 5
        `, [
            `${search}%`,    // Exact prefix match
            `%${search}%`,   // Contains
            `%${search}`,    // Suffix match
            `${search}%`,    // Location prefix
            `%${search}%`,   // Location contains
            `%${search}`,    // Location suffix
            `${search}%`,    // For WHERE clause
            `%${search}%`, 
            `%${search}`,
            `${search}%`,
            `%${search}%`,
            `%${search}`
        ]);
        
        res.json({ nodes });
    } catch (error) {
        console.error("Error searching nodes:", error);
        res.status(500).json({ message: "Error searching nodes" });
    }
});

// Add new object endpoint
app.post("/api/objects", async (req, res) => {
    const { roomId, objectName, objectType, objectOthers } = req.body;

    if (!roomId || !objectName) {
        return res.status(400).json({ error: "Room ID and object name are required" });
    }

    try {
        // Get the Node_ID from the room
        const [room] = await db.query(
            "SELECT Node_ID FROM room WHERE Room_ID = ?",
            [roomId]
        );

        if (!room[0]) {
            return res.status(404).json({ error: "Room not found" });
        }

        const nodeId = room[0].Node_ID;

        // Generate new Object_ID
        const [maxId] = await db.query(
            "SELECT MAX(CAST(SUBSTRING(Object_ID, 4) AS UNSIGNED)) as maxId FROM object"
        );
        const nextId = (maxId[0].maxId || 0) + 1;
        const objectId = `OBJ${nextId.toString().padStart(5, '0')}`;

        // Insert the new object
        await db.query(
            "INSERT INTO object (Object_ID, Node_ID, Room_ID, Object_Name, Object_Type, Object_Others) VALUES (?, ?, ?, ?, ?, ?)",
            [objectId, nodeId, roomId, objectName, objectType || '', objectOthers || '']
        );

        res.status(201).json({ message: "Object created successfully", objectId });
    } catch (error) {
        console.error("Error creating object:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Add delete object endpoint
app.delete("/api/objects/:objectId", async (req, res) => {
    const { objectId } = req.params;

    try {
        // First check if the object has any items
        const [items] = await db.query(
            "SELECT COUNT(*) as count FROM item WHERE Object_ID = ?",
            [objectId]
        );

        if (items[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete object that has items assigned to it"
            });
        }

        // If no items, proceed with deletion
        const [result] = await db.query(
            "DELETE FROM object WHERE Object_ID = ?",
            [objectId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Object not found"
            });
        }

        res.json({
            success: true,
            message: "Object deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting object:", error);
        res.status(500).json({
            success: false,
            message: "Error deleting object",
            error: error.message
        });
    }
});

// Add this new endpoint
app.get("/api/rooms/:roomId/objects", async (req, res) => {
    console.log(`Fetching objects for room ${req.params.roomId}`);
    try {
        const sql = `
            SELECT 
                o.*,
                COUNT(DISTINCT i.Item_ID) as item_count,
                n.Node_Name, 
                n.Node_Location, 
                n.Node_Building, 
                r.Room_Floor, 
                r.Room_Name,
                GROUP_CONCAT(DISTINCT i.Item_ID) as item_ids
            FROM object o
            JOIN node n ON o.Node_ID = n.Node_ID
            JOIN room r ON o.Room_ID = r.Room_ID
            LEFT JOIN item i ON o.Object_ID = i.Object_ID
            WHERE o.Room_ID = ?
            GROUP BY o.Object_ID, o.Object_Name, o.Object_Type, o.Object_Others
        `;
        console.log('Executing SQL:', sql);
        console.log('With roomId:', req.params.roomId);

        const [objects] = await db.query(sql, [req.params.roomId]);
        console.log('Query results:', objects);

        // For each object, fetch its items' latest history
        for (let object of objects) {
            if (object.item_ids) {
                const itemIds = object.item_ids.split(',');
                const [itemHistories] = await db.query(`
                    SELECT 
                        i.Item_ID,
                        i.Item_Status,
                        ih.Item_history_Status,
                        ih.Item_history_CreateDate
                    FROM item i
                    LEFT JOIN (
                        SELECT 
                            Item_ID,
                            Item_history_Status,
                            Item_history_CreateDate,
                            ROW_NUMBER() OVER (PARTITION BY Item_ID ORDER BY Item_history_CreateDate DESC) as rn
                        FROM item_history
                    ) ih ON i.Item_ID = ih.Item_ID AND ih.rn = 1
                    WHERE i.Item_ID IN (?)
                `, [itemIds]);
                
                object.items_history = itemHistories;
            }
        }

        res.json(objects);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ 
            error: "Error fetching objects",
            details: err.message,
            sql: err.sql 
        });
    }
});

// Add this endpoint for updating objects
app.put("/api/objects/:objectId", async (req, res) => {
    const { objectId } = req.params;
    const { objectName, objectType, objectOthers } = req.body;

    try {
        const [result] = await db.query(
            `UPDATE object 
             SET Object_Name = ?, Object_Type = ?, Object_Others = ?
             WHERE Object_ID = ?`,
            [objectName, objectType, objectOthers, objectId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Object not found"
            });
        }

        res.json({
            success: true,
            message: "Object updated successfully"
        });
    } catch (error) {
        console.error("Error updating object:", error);
        res.status(500).json({
            success: false,
            message: "Error updating object",
            error: error.message
        });
    }
});

// Add this new endpoint to get items by object ID
app.get("/api/objects/:objectId/items", async (req, res) => {
    try {
        const [items] = await db.query(`
            SELECT 
                i.*,
                e.Equipe_Name,
                e.Brand,
                e.Model_Number
            FROM item i
            JOIN equipement e ON i.Equipe_ID = e.Equipe_ID
            WHERE i.Object_ID = ?`, 
            [req.params.objectId]
        );
        
        res.json({ 
            success: true,
            data: items 
        });
    } catch (error) {
        console.error("Error fetching items:", error);
        res.status(500).json({ 
            success: false,
            message: "Error fetching items",
            error: error.message 
        });
    }
});

// Add this new endpoint
app.get("/api/object/:objectId", async (req, res) => {
    try {
        const [object] = await db.query(
            `SELECT o.*, n.Node_Name, r.Room_Name, r.Room_ID
             FROM object o
             JOIN node n ON o.Node_ID = n.Node_ID
             JOIN room r ON o.Room_ID = r.Room_ID
             WHERE o.Object_ID = ?`,
            [req.params.objectId]
        );

        if (object.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Object not found"
            });
        }

        res.json({
            success: true,
            data: object[0]
        });

    } catch (error) {
        console.error("Error fetching object:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching object",
            error: error.message
        });
    }
});

// Get available equipment that can be added to objects
app.get("/api/available-equipment", async (req, res) => {
    try {
        const [equipment] = await db.query(`
            SELECT 
                e.Equipe_ID,
                e.Equipe_Name,
                e.Brand,
                e.Model_Number,
                COUNT(i.Item_ID) as current_items,
                e.Equipe_Type
            FROM equipement e
            LEFT JOIN item i ON e.Equipe_ID = i.Equipe_ID
            GROUP BY e.Equipe_ID
        `);
        res.json({ success: true, data: equipment });
    } catch (error) {
        console.error("Error fetching available equipment:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error fetching available equipment" 
        });
    }
});

// Add equipment to object
app.post("/api/objects/:objectId/items", async (req, res) => {
    const { objectId } = req.params;
    const { 
        User_ID, 
        Equipe_ID, 
        Serial_Number, 
        Item_Status = 'active',
        Item_Others = ''
    } = req.body;

    if (!User_ID || !Equipe_ID || !Serial_Number) {
        return res.status(400).json({
            success: false,
            message: "Missing required fields"
        });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check if serial number already exists
        const [existingItem] = await connection.query(
            "SELECT Item_ID FROM item WHERE Serial_Number = ?",
            [Serial_Number]
        );

        if (existingItem.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Serial number already exists"
            });
        }

        // Generate new Item_ID
        const [maxId] = await connection.query(
            "SELECT MAX(CAST(SUBSTRING(Item_ID, 2) AS UNSIGNED)) as maxId FROM item"
        );
        const nextId = (maxId[0].maxId || 0) + 1;
        const itemId = `I${nextId.toString().padStart(8, '0')}`;

        // Insert new item
        await connection.query(
            `INSERT INTO item (
                Item_ID, User_ID, Equipe_ID, Object_ID, 
                Serial_Number, Item_CreateDate, Item_Status, Item_Others
            ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
            [itemId, User_ID, Equipe_ID, objectId, Serial_Number, Item_Status, Item_Others]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Item added successfully",
            itemId
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error("Error adding item:", error);
        res.status(500).json({
            success: false,
            message: "Error adding item",
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Add this new endpoint for note search
app.get("/api/note/search", async (req, res) => {
    const { searchType, searchTerm } = req.query;

    try {
        let sql = `
            SELECT 
                note.Note_ID,
                note.Note_Head,
                note.Note_CreateDate,
                note.Note,
                note.Note_LastModifiedDate,
                user_nt.User_ID,
                user_nt.Name,
                role.Rolename AS RoleName
            FROM note
            LEFT JOIN user_nt ON note.User_ID = user_nt.User_ID
            LEFT JOIN role ON user_nt.Role_ID = role.Role_ID
            WHERE 1=1
        `;

        const params = [];

        if (searchTerm && searchTerm.trim() !== '') {
            switch (searchType) {
                case 'name':
                    sql += ` AND user_nt.Name LIKE ?`;
                    params.push(`%${searchTerm}%`);
                    break;
                case 'title':
                    sql += ` AND note.Note_Head LIKE ?`;
                    params.push(`%${searchTerm}%`);
                    break;
                case 'date':
                    sql += ` AND DATE(note.Note_CreateDate) = ?`;
                    params.push(searchTerm);
                    break;
                case 'all':
                default:
                    sql += ` AND (
                        user_nt.Name LIKE ? OR 
                        note.Note_Head LIKE ? OR 
                        note.Note LIKE ?
                    )`;
                    params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
                    break;
            }
        }

        sql += ` ORDER BY note.Note_CreateDate DESC`;

        const [results] = await db.query(sql, params);
        res.json({ success: true, data: results });

    } catch (error) {
        console.error('Error searching notes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error searching notes',
            error: error.message 
        });
    }
});



