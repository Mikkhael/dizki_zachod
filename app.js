// Przygotowanie wykorzystywanych modułów
const http          = require("http");      // Serwer HTTP
const express       = require("express");   // Framework ułatwiający konfigurację serwera
const path          = require("path");      // Wrapper do tworzenia ścierzek do plików i folderó na systemie

const app           = express();
const httpServer    = http.createServer(app);

const io            = require("socket.io")(httpServer); // Moduł Socket.io skojarzony z naszym serwerem


// Obsłurzenie zapytaań protokołu HTTP typu GET
app.get('/watch', function(req, res){
    res.sendFile(path.join(__dirname, "/watch.html"));
});

app.get('/play', function(req, res){
    res.sendFile(path.join(__dirname, "/play.html"));
});

/* Krótki opis typów komunikatów socket.io wykorzystywanych w aplikacji

    Player -> Server
        iWannaPlay  - wiadomość dla serwera, że dany socket chce być graczem
        fire        - gracz strzelił
    
    Player <- Server
        result(bool won) - wiadomość dla gracza, czy wygrał, czy przegrał
        
    Watcher -> Server
        iWannaWatch  - wiadomość dla serwera, że dany socket chce być widzem
        start        - wysłanie komunikatu, by gra się rozpoczęła
        
    Watcher <- Server
        updateState(string state) - komunikat o aktualnym stanie gry

*/

/*
    Zmienna 'gameState' przechowuje informacje o aktualnym stanie naszej gry
    Możliwe stany to:
    setup       - nowi gracze moga się dołączać, gra jeszcze sie nei zaczęła
    fajny       - rozpoczyna się odliczanie, nowi gracze nie mogą się już połączyć.
    niefajny    - odliczanie się skończyło, gracze mogą strzelać.
    end         - gra zakończona
*/
var gameState = "setup";


// Minimalny i maksymalny czas odliczania
const minCountdown = 3000;
const maxCountdown = 10000;

// Funkcja rozpoczynająca grę
function startGame(){
    // Ustawienie odliczania na nosową liczbę milisekund, pomiędzy 'minCountdown' i 'maxCountdown'
    let countdown = Math.random() * (maxCountdown - minCountdown) + minCountdown;

    // Ustawienie opóźnienia. Za 'countdown' milisekund wywoła się funkcja zmieniająca stan na niefajny
    setTimeout(function(){
        
        // Zmiana stanu na niefajny
        gameState = "niefajny";
        // Wysłanie wszystkim widzom aktualizacji zmiany stanu
        io.in("watchers").emit("updateState", "niefajny");

    }, countdown);
}

// Obiekt, który przechowywać będzie ID graczy, którzy strzelili za szybko
var falseStarts = {};

// Obsłużenie nowego połączenia z socketem
io.on("connection", function(socket){

    // Obsłużenie wiadomości typu "start"
    socket.on("start", function(){
        
        // Sprawdź, czy aktualny stan to setup
        if(gameState == "setup"){
            // Zmiana stany na fajny
            gameState = "fajny";
            // Wysłanie wszystkim widzom aktualizacji zmiany stanu
            io.in("watchers").emit("updateState", "fajny");
            // Rozpoczęcie gry
            startGame();
        }
        
    });

    // Obsłużenie wiadomości typu "iWannaPlay"
    socket.on("iWannaPlay", function(){
        
        // Sprawdź, czy nowu gracze mogą się połączyć
        if(gameState == "setup"){
            // Jeśli tak, to przypisz socketa chcącego się połączyć do pokoju "players"
            socket.join("players");
        }else{
            // Jeśłi nie, to rozłącz się z klientem, żeby się nic nie popsuło
            socket.disconnect();
        }
        
    });

    // Obsłużenie wiadomości typu "iWannaWatch"
    socket.on("iWannaWatch", function(){

        // Przypisanie socketa chcącego się połączyć do pokoju "watchers"
        socket.join("watchers");

    });

    // Obsłużenie wiadomości typu "fire"
    socket.on("fire", function(){

        console.log("fired");
        
        // Sprawdź aktualny stan
        if(gameState == "fajny"){ // Jeśli gra się rozpoczęła, ale odliczanie jeszcze sie nie skończyło
            
            // Dodaj ID socketa do obiektu falseStarts
            falseStarts[socket.id] = true;
            // Wyślij klientowi wiadomość o przegranej
            socket.emit("result", false);

        }else if(gameState == "niefajny"){ // Jeśli odliczanie się skończyło i oczekujemy, aż ktoś strzeli

            // Sprawdź, czy dany klient nie wystrzelił wcześniej przed zakończeniem odliczania
            if(falseStarts[socket.id]){
                // Jeśli tak było, to zakończ funkcję
                return;
            }
            // W przeciwnym razie, oznacza to, że dany gracz wygrał, strzelając jako pierwszy po zakończeniu odliczania
            
            // Zmiana stanu na end
            gameState = "end";
            // Wysłanie wszystkim widzom aktualizacji zmiany stanu
            io.in("watchers").emit("updateState", "end");
            // Wysłanie wszystkim graczom, za wyjątkiem tego gracza, który strzelił, komunikatu o przegranej
            socket.in("players").emit("result", false);
            // Wysłanie graczowi, który strzelił, komunikatu o wygranej
            socket.emit("result", true);
            
            // Ustawienie opóźnienia 5 sekund dla funkcji zmieniającej stan na setup
            setTimeout(function(){
                // Zmiana stany na setup
                gameState = "setup";
                // Wysłanie wszystkim widzom aktualizacji zmiany stanu
                io.in("watchers").emit("updateState", "setup");
                // Usunięcie rejestru graczy, którzy w poprzedniej grze strzelili za szybko
                falseStarts = {};
            }, 5000);
        }


    });

});


// Uruchomienie serwera na porcie 80
httpServer.listen(80, function(){
    console.log("Server started");
});


// Poniżej dawny WebSocket, dla ewentualnego porównania, którym już się interesować nie musimy

// Websocket
/*
const wss = new websocket.Server({
    server: httpServer
});

let players = [];
let watchers = [];

wss.on("connection", function(socket){

    socket.on("message", function(data){

        if(data === "i wanna play"){
            
            players.push(socket);

        }else if(data === "i wanna watch"){

            watchers.push(socket);

        }else if(data === "fire"){
            
            for(let watcher of watchers)
            {
                watcher.send("fired");
            }
            for(let player of players)
            {
                if(player !== socket)
                {
                    player.send("fired");
                }
            }

        }
    });

    socket.on("close", function(){
        for(let i=0; i < watchers.length; i++){
            if(watchers[i] == socket){
                watchers.splice(i, 1);
                break;
            }
        }
        for(let i=0; i < players.length; i++){
            if(players[i] == socket){
                players.splice(i, 1);
                break;
            }
        }
    });
});
*/