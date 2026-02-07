function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for other processes to finish.
  try {
    lock.waitLock(30000); 
  } catch (e) {
    return createJSONOutput({ status: "busy", message: "Server is busy. Please retry." });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var props = PropertiesService.getScriptProperties();
    
    // Parse data
    var data;
    try {
        data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
        return createJSONOutput({ status: "error", message: "Invalid JSON data" });
    }

    var name = data.name;
    var email = data.email;
    var phone = data.phone;
    var college = data.college;
    var action = data.action; 

    var foundUser = findUserByEmail(ss, email);

    if (action === "login") {
      if (foundUser) {
        return createJSONOutput({ status: "success", message: "Found", data: foundUser });
      } else {
        return createJSONOutput({ status: "error", message: "User not found. Please register." });
      }
    }

    if (foundUser) {
      return createJSONOutput({ status: "error", message: "User already registered!", data: foundUser });
    }

    // --- BATCH MANAGEMENT ---
    var MAX_PER_BATCH = 180;
    
    // Get current active batch number
    var currentBatchNum = parseInt(props.getProperty("CURRENT_BATCH_NUM")) || 1;
    var sheetName = "Batch " + currentBatchNum;
    var activeSheet = ss.getSheetByName(sheetName);

    if (!activeSheet) {
      activeSheet = createBatchSheet(ss, sheetName);
    }

    // Check capacity
    var currentCountInBatch = activeSheet.getLastRow() - 1;

    if (currentCountInBatch >= MAX_PER_BATCH) {
      currentBatchNum++;
      props.setProperty("CURRENT_BATCH_NUM", currentBatchNum.toString());
      
      sheetName = "Batch " + currentBatchNum;
      activeSheet = createBatchSheet(ss, sheetName);
      currentCountInBatch = 0;
    }

    // Global Counter
    var globalCount = parseInt(props.getProperty("GLOBAL_COUNT")) || 0;
    globalCount++;
    props.setProperty("GLOBAL_COUNT", globalCount.toString());

    // --- ALLOCATION LOGIC ---
    var positionInBatch = currentCountInBatch + 1; // 1 to 180
    
    // Room: 1-60 -> R1, 61-120 -> R2, 121-180 -> R3
    var classroomNum = Math.ceil(positionInBatch / 60); 
    
    // Seat: 1-60 per room
    // If pos=1 -> (0%60)+1 = 1
    // If pos=60 -> (59%60)+1 = 60
    // If pos=61 -> (60%60)+1 = 1
    var seatNumber = ((positionInBatch - 1) % 60) + 1;

    var batchName = "Batch " + currentBatchNum;
    var classroomName = "Classroom " + classroomNum;
    var seatStr = "Seat " + seatNumber;

    // Append to Sheet
    activeSheet.appendRow([
      new Date(), 
      globalCount, 
      name, 
      email, 
      phone, 
      college, 
      batchName, 
      classroomName,
      seatStr
    ]);

    var responseData = { 
      batch: batchName, 
      classroom: classroomName, 
      seat: seatStr, 
      id: globalCount 
    };

    return createJSONOutput({ 
      status: "success", 
      message: "Registration Successful!", 
      data: responseData
    });

  } catch (err) {
    return createJSONOutput({ status: "error", message: "Server Error: " + err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function createBatchSheet(ss, name) {
  var sheet = ss.insertSheet(name);
  sheet.appendRow(["Timestamp", "Student ID", "Name", "Email", "Phone", "College", "Batch", "Classroom", "Seat Number"]);
  return sheet;
}

function findUserByEmail(ss, email) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (sheet.getName().startsWith("Batch ")) {
      var data = sheet.getDataRange().getValues();
      for (var r = 1; r < data.length; r++) {
        if (data[r][3] == email) { 
          return {
            batch: data[r][6],
            classroom: data[r][7],
            seat: data[r][8], // Seat is now at index 8
            id: data[r][1]
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
