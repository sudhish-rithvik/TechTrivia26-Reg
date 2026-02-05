function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); // Wait up to 10s for other processes

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Parse data
    var data = JSON.parse(e.postData.contents);
    var name = data.name;
    var email = data.email;
    var phone = data.phone;
    var college = data.college;
    var action = data.action; 

    // --- HELPER TO FIND USER IN ANY BATCH SHEET ---
    var foundUser = findUserByEmail(ss, email);

    if (action === "login") {
      if (foundUser) {
        return createJSONOutput({ status: "success", message: "Found", data: foundUser });
      } else {
        return createJSONOutput({ status: "error", message: "User not found. Please register." });
      }
    }

    // --- REGISTRATION LOGIC ---
    if (foundUser) {
      return createJSONOutput({ status: "error", message: "User already registered!", data: foundUser });
    }

    // Find Active Batch Sheet
    var batchNum = 1;
    var MAX_PER_BATCH = 180; // 3 rooms * 60
    var activeSheet = null;
    var totalGlobalCount = 0;

    while (true) {
      var sheetName = "Batch " + batchNum;
      var sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) {
        // Create new batch sheet
        activeSheet = ss.insertSheet(sheetName);
        activeSheet.appendRow(["Timestamp", "Student ID", "Name", "Email", "Phone", "College", "Batch", "Classroom"]);
        // If this is Batch 1, total previous users is 0. If Batch 2, it's 180 etc.
        // Actually simpler to just track activeSheet context
        break;
      }
      
      var lastRow = sheet.getLastRow();
      // "lastRow" includes header. So data count is lastRow - 1.
      var dataCount = lastRow - 1;
      
      // Accumulate global count from full previous sheets
      if (dataCount >= MAX_PER_BATCH) {
        totalGlobalCount += dataCount;
        batchNum++;
        continue; // Check next batch
      } else {
        // Found a sheet with space
        activeSheet = sheet;
        totalGlobalCount += dataCount; // Add existing users in this current sheet
        break;
      }
    }

    // Calculate details for NEW user
    var newGlobalID = totalGlobalCount + 1;
    
    // Calculate Position in THIS batch (1-based)
    var positionInBatch = (activeSheet.getLastRow() - 1) + 1; 
    
    // Room Logic: 
    // 1-60 -> Room 1
    // 61-120 -> Room 2
    // 121-180 -> Room 3
    var classroom = Math.ceil(positionInBatch / 60); 
    
    var batchName = "Batch " + batchNum;
    var classroomName = "Classroom " + classroom;

    // Append to Sheet
    activeSheet.appendRow([
      new Date(), 
      newGlobalID, 
      name, 
      email, 
      phone, 
      college, 
      batchName, 
      classroomName
    ]);

    return createJSONOutput({ 
      status: "success", 
      message: "Registration Successful!", 
      data: { batch: batchName, classroom: classroomName } 
    });

  } catch (err) {
    return createJSONOutput({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function findUserByEmail(ss, email) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    if (name.startsWith("Batch ")) {
      var data = sheet.getDataRange().getValues();
      // Skip header (r=1)
      for (var r = 1; r < data.length; r++) {
        // Email is at index 3 in new format: [Timestamp, ID, Name, Email...]
        if (data[r][3] == email) {
          return {
            batch: data[r][6], // Batch column index
            classroom: data[r][7] // Classroom column index
          };
        }
      }
    }
  }
  return null;
}

function createJSONOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return createJSONOutput({ status: "alive" });
}
