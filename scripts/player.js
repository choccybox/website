let currentProgress = 0;
let currentDuration = 0;
let isPlaying = false;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            isPlaying = data.isPlaying;

            if (isPlaying) {
                console.log(`🟢 playing\n📰 name: ${data.name} • ${data.artist}\n🔗 url: ${data.url}`);

                // Update text
                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;

                // Check if user is on a mobile device
                var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

                // Check if user is using cellular data
                var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                var isCellular = false;

                if (connection && connection.type === 'cellular') {
                    isCellular = true;
                }

                console.log("📱 is mobile player?", isMobile);
                console.log("📶 is cellular player?", isCellular);

                // if user is on mobile, set the avatar to the mobile avatar
                if (isMobile && isCellular) {
                    document.getElementById("player_image").src = data.art.low;
                } else {
                    document.getElementById("player_image").src = data.art.high;
                }

                // if no url, remove target attribute
                if (data.url === null) {
                    document.getElementById("player_link").removeAttribute("target");
                    document.getElementById("player_link").href = "#";
                } else {
                    document.getElementById("player_link").href = data.url;
                }

                // if source is spotify, color the progress bar green
                if (data.source === "spotify") {
                    document.getElementById("player_progress").style.backgroundColor = "#1DB954";
                } else if (data.source === "soundcloud") {
                    document.getElementById("player_progress").style.backgroundColor = "#FF5500";
                } else {
                    document.getElementById("player_progress").style.backgroundColor = "#FFFFFF";
                }

                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                document.getElementById("player_timeline").style.backgroundColor = "var(--timeline)";

                currentProgress = data.progress || 0;
                currentDuration = data.duration || 0;

                const progressPercentage = (currentProgress / currentDuration) * 100;
                document.getElementById("player_progress").style.width = progressPercentage + "%";


                if (currentProgress >= currentDuration) {
                    fetchAndDisplayTime();
                }
                updateFakeProgressBar();
                } else {
                console.log(`🔴 not playing\n📰 name: ${data.name} • ${data.artist}\n🔗 url: ${data.url}`);

                // Update text
                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;

                // Check if user is on a mobile device
                var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

                // Check if user is using cellular data
                var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                var isCellular = false;

                if (connection && connection.type === 'cellular') {
                    isCellular = true;
                }

                console.log("📱 is mobile player?", isMobile);
                console.log("📶 is cellular player?", isCellular);

                // if user is on mobile, set the avatar to the mobile avatar
                if (isMobile && isCellular) {
                    document.getElementById("player_image").src = data.art.low;
                } else {
                    document.getElementById("player_image").src = data.art.high;
                }

                // if source is spotify, color the progress bar green
                if (data.source === "spotify") {
                    document.getElementById("player_progress").style.backgroundColor = "#1DB954";
                } else if (data.source === "soundcloud") {
                    document.getElementById("player_progress").style.backgroundColor = "#FF5500";
                } else {
                    document.getElementById("player_progress").style.backgroundColor = "#FFFFFF";
                }

                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                currentProgress = 0;

                document.getElementById("player_progress").style.width = "100%";
                updateFakeProgressBar();

            }
        });
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 10000);

// Update fake progress only when playing
function updateFakeProgressBar() {
    if (isPlaying && currentProgress < currentDuration) {
        // each second, add however much the progress bar has progressed
        currentProgress += 1000;

        // set width of progress bar
        const progressPercentage = (currentProgress / currentDuration) * 100;
        document.getElementById("player_progress").style.width = progressPercentage + "%";

        if (currentProgress >= currentDuration) {
            // Handle song completion
            fetchAndDisplayTime();
        }
    } else {
        // Handle playback stop
        currentProgress = 0;
    }
}

// Update fake progress every second
setInterval(updateFakeProgressBar, 1000);
