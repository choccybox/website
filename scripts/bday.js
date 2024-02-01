// date (dd/mm/yyyy) of birth
var birthDateString = "06/09/2007";
var birthDateParts = birthDateString.split('/');
var birthDate = new Date(birthDateParts[2], birthDateParts[1] - 1, birthDateParts[0]); // year, month (0-indexed), day

// age calculation
var ageDifMs = Date.now() - birthDate.getTime();
var ageDate = new Date(ageDifMs);
var age = Math.abs(ageDate.getUTCFullYear() - 1970);
var nextage = age + 1;

// calculate days until next birthday
var today = new Date();
var nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());

// If the birthday has already occurred this year, calculate for the next year
if (today.getMonth() > birthDate.getMonth() || (today.getMonth() == birthDate.getMonth() && today.getDate() >= birthDate.getDate())) {
    nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
}

var oneDay = 1000 * 60 * 60 * 24;
// if only one day, display "day" instead of "days
var daysUntil = Math.ceil((nextBirthday.getTime() - today.getTime()) / (oneDay));
if (daysUntil == 1) {
    daysUntil = "1 day";
} else {
    daysUntil = daysUntil + " days";
}

document.getElementById("age").innerHTML = `${age} <span id="bday">(${nextage} in ${daysUntil})</span>`;
