
const express = require("express");
const mysql = require("mysql8");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "160206G",
    database: "leave_management"
});

db.connect((err) => {
    if (err) {
        console.error("MySQL connection error:", err.message);
        return;
    }
    console.log("Connected to Leave Management database");
});

const allowedTypes = [
    "Casual", "Sick", "Earned", "Maternity", "Other"
];

const publicPath = path.join(__dirname, "public");

app.get("/", (req, res) => {
    res.sendFile(path.join(publicPath, "leave-home.html"));
});

app.use(express.static(publicPath));

// GET ALL EMPLOYEES
app.get("/employees", (req, res) => {
    db.query(
        `SELECT EMPLOYEE_ID, NAME, DEPARTMENT
         FROM employees ORDER BY EMPLOYEE_ID`,
        (err, rows) => {
            if (err) {
                console.error("Employee fetch error:", err.message);
                return res.status(500).json({
                    message: "Could not load employees."
                });
            }
            res.json(rows);
        }
    );
});

// GET EMPLOYEE IDS
app.get("/employee-ids", (req, res) => {
    db.query(
        "SELECT EMPLOYEE_ID FROM employees ORDER BY EMPLOYEE_ID",
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    message: "Could not load employee IDs."
                });
            }
            res.json(rows.map(row => row.EMPLOYEE_ID));
        }
    );
});

// APPLY LEAVE: REGISTER NEW EMPLOYEE IF NEEDED, THEN SAVE LEAVE
app.post("/leaves", (req, res) => {
    const {
        EMPLOYEE_ID,
        NAME,
        DEPARTMENT,
        TYPE_OF_LEAVE,
        NUMBER_OF_DAYS,
        DESCRIPTION
    } = req.body;

    const id = Number(EMPLOYEE_ID);
    const days = Number(NUMBER_OF_DAYS);
    const name = typeof NAME === "string" ? NAME.trim() : "";
    const department =
        typeof DEPARTMENT === "string" ? DEPARTMENT.trim() : "";
    const description =
        typeof DESCRIPTION === "string" ? DESCRIPTION.trim() : "";

    if (
        !Number.isSafeInteger(id) || id <= 0 ||
        !name || !department ||
        !allowedTypes.includes(TYPE_OF_LEAVE) ||
        !Number.isSafeInteger(days) || days <= 0 ||
        !description
    ) {
        return res.status(400).json({
            message: "Please enter valid details in every field."
        });
    }

    // Check whether this employee already exists.
    db.query(
        "SELECT EMPLOYEE_ID FROM employees WHERE EMPLOYEE_ID = ?",
        [id],
        (checkError, employees) => {
            if (checkError) {
                console.error(checkError.message);
                return res.status(500).json({
                    message: "Could not verify employee details."
                });
            }

            function saveLeave() {
                const sql = `
                    INSERT INTO leave_records
                    (EMPLOYEE_ID, NAME, DEPARTMENT,
                     TYPE_OF_LEAVE, NUMBER_OF_DAYS, DESCRIPTION)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;

                db.query(
                    sql,
                    [id, name, department, TYPE_OF_LEAVE,
                     days, description],
                    (err, result) => {
                        if (err) {
                            console.error("Leave insert error:", err.message);

                            if (err.code === "ER_DUP_ENTRY") {
                                return res.status(409).json({
                                    message:
                                        "A leave record already exists for this Employee ID. Check the leave_records table's unique constraints."
                                });
                            }

                            return res.status(500).json({
                                message: "Could not save the leave record."
                            });
                        }

                        res.status(201).json({
                            message: "Leave application saved successfully!",
                            employeeRegistered: employees.length === 0,
                            employeeId: id
                        });
                    }
                );
            }

            if (employees.length > 0) {
                // Existing employee: save the leave record.
                return saveLeave();
            }

            // New employee: insert into employees first.
            db.query(
                `INSERT INTO employees
                 (EMPLOYEE_ID, NAME, DEPARTMENT)
                 VALUES (?, ?, ?)`,
                [id, name, department],
                (insertError) => {
                    if (insertError) {
                        console.error(
                            "New employee insert error:",
                            insertError.message
                        );
                        return res.status(500).json({
                            message:
                                "Could not register the new employee. Check the employees table structure."
                        });
                    }

                    saveLeave();
                }
            );
        }
    );
});

// LIST ALL LEAVE RECORDS
app.get("/leaves", (req, res) => {
    db.query(
        `SELECT EMPLOYEE_ID, NAME, DEPARTMENT,
                TYPE_OF_LEAVE, NUMBER_OF_DAYS, DESCRIPTION
         FROM leave_records ORDER BY EMPLOYEE_ID`,
        (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).json({
                    message: "Could not load leave records."
                });
            }
            res.json(rows);
        }
    );
});

// GET ONE LEAVE RECORD
app.get("/leaves/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Please provide a valid Employee ID."
        });
    }

    db.query(
        `SELECT EMPLOYEE_ID, NAME, DEPARTMENT,
                TYPE_OF_LEAVE, NUMBER_OF_DAYS, DESCRIPTION
         FROM leave_records WHERE EMPLOYEE_ID = ?`,
        [id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    message: "Could not search the leave record."
                });
            }
            if (rows.length === 0) {
                return res.status(404).json({
                    message: "Employee leave record not found."
                });
            }
            res.json(rows[0]);
        }
    );
});

// UPDATE LEAVE RECORD
app.put("/leaves/:id", (req, res) => {
    const id = Number(req.params.id);
    const {
        NAME, DEPARTMENT, TYPE_OF_LEAVE,
        NUMBER_OF_DAYS, DESCRIPTION
    } = req.body;

    const days = Number(NUMBER_OF_DAYS);
    const name = typeof NAME === "string" ? NAME.trim() : "";
    const department =
        typeof DEPARTMENT === "string" ? DEPARTMENT.trim() : "";
    const description =
        typeof DESCRIPTION === "string" ? DESCRIPTION.trim() : "";

    if (
        !Number.isSafeInteger(id) || id <= 0 ||
        !name || !department ||
        !allowedTypes.includes(TYPE_OF_LEAVE) ||
        !Number.isSafeInteger(days) || days <= 0 ||
        !description
    ) {
        return res.status(400).json({
            message: "Please enter valid details in every field."
        });
    }

    db.query(
        `UPDATE leave_records
         SET NAME = ?, DEPARTMENT = ?, TYPE_OF_LEAVE = ?,
             NUMBER_OF_DAYS = ?, DESCRIPTION = ?
         WHERE EMPLOYEE_ID = ?`,
        [name, department, TYPE_OF_LEAVE, days, description, id],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    message: "Could not update the leave record."
                });
            }

            if (result.affectedRows === 0) {
                return db.query(
                    "SELECT EMPLOYEE_ID FROM leave_records WHERE EMPLOYEE_ID = ?",
                    [id],
                    (checkError, rows) => {
                        if (checkError) {
                            return res.status(500).json({
                                message: "Could not verify the leave record."
                            });
                        }
                        if (rows.length === 0) {
                            return res.status(404).json({
                                message: "Employee ID not found."
                            });
                        }
                        res.json({
                            message: "Leave record is already up to date."
                        });
                    }
                );
            }

            res.json({
                message: "Leave record updated successfully!"
            });
        }
    );
});

// DELETE LEAVE RECORD
app.delete("/leaves/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Please provide a valid Employee ID."
        });
    }

    db.query(
        "DELETE FROM leave_records WHERE EMPLOYEE_ID = ?",
        [id],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    message: "Could not delete the leave record."
                });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Employee leave record not found."
                });
            }
            res.json({
                message: "Leave record deleted successfully!"
            });
        }
    );
});

// UNKNOWN LEAVE API ROUTES
app.use("/leaves", (req, res) => {
    res.status(404).json({
        message: "Leave API route not found."
    });
});

app.listen(PORT, () => {
    console.log(
        `Leave Management server running at http://localhost:${PORT}`
    );
});
