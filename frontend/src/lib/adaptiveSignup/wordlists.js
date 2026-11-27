/**
 * Word lists for the suggested password of the sign-up card (growth 1B "Akılda kalan şifre
 * önerisi"): everyday nouns per language, ASCII only (typed on any keyboard, no layout
 * switch), 3 to 10 letters, family friendly. Turkish words are written without the
 * Turkish letters (Marti, Kayik). Russian is transliterated (the passwords stay Latin).
 * Every list has at least 512 unique words: 4 words + a 2-digit number is over 42 bits.
 * Loaded only when a suggestion is shown (dynamic import). Checked by passphrase.selftest.mjs.
 */
export const WORDLISTS = {
  tr: (
    "ada adim agac ahenk akim akis alev alan altin anahtar anka arka armut aslan ates avlu ayna ayva " +
    "bahar bahce balik balkon bant baraj bardak basak baston bayrak belde benek beyaz bilet bilge bina " +
    "biber bisiklet bulut buz cadde cep ceviz cicek cilek cizgi deniz defne demir dere derin dolap dolma " +
    "dost dunya durak duvar ekin ekmek elma eldiven emek erik esinti eser evren fener fidan findik firin " +
    "fikir filiz fincan fistik fok gemi gece gelincik gezgin gol gonca gunes hamak harita hasat hava " +
    "havuz hazine helva hilal huzur ilham incir inci irmak isik iskele kafes kalem kale kanat kapi karpuz " +
    "kartal kasaba kavak kaval kayik kaya kedi kekik kelebek kemer kestane keman kiraz kilim kitap koru " +
    "kopru kova koy kum kumru kule kurabiye kuzey kuzu lale lamba leylek limon lodos lokum mavi marti " +
    "masal mangal mantar mektup meltem menekse mermer mevsim meyve mimar misket mozaik muzik nane nar " +
    "nehir nergis nisan ocak oda okul olta orman ova oyun pamuk pasta patika peri pinar pirinc portakal " +
    "poyraz pusula rota ruzgar saat sahil sakiz salkim sandal sapka sarki sedef sehir serin seyir simit " +
    "sincap sira sokak somun sumak sunger tahta takvim tarla tavla tava tepe terazi tilki toprak tren tuz " +
    "uzum vadi vapur yaprak yayla yildiz yol yonca yorgan yumak yunus zambak zeytin zil akasya ahududu " +
    "ahtapot alabalik albatros ananas arpa ari atlas avize ayakkabi aysberg ayi bakla balina bambu batik " +
    "bavul bayram begonya bereket bilye biblo bocek bonzai bozkir bugday bulmaca burcak burun cadir camur " +
    "canta cay cekirdek cember cesme cevre ceylan cimen cinar cips coban corba cuval dag dalga damla " +
    "davul defter degirmen denge desen dikis dilek dinamo dolu domates dudak dut efsane egzersiz ejder " +
    "elmas enerji erguvan esik eskiz etek fasulye fayans fermuar fesleken fidanlik fiske flama fotograf " +
    "futbol gazete gemici geyik gitar gokkusagi gokyuzu golge gozluk gul gumus hali hamsi hanimeli harman " +
    "hasir havlu hayal hediye hindi hurma ibrik ihlamur ilik inek ipek ipucu istasyon kabak kadife kahve " +
    "kakao kaktus kalkan kamp kanarya kanepe kaplan kapsul karanfil karga karinca kasik kavun kaymak " +
    "kayisi kazan kebap kepce kervan keski kibrit kilit kirpi kivi kizak koltuk kompas konak kopuk " +
    "kozalak kumbara kumsal kupa kurdele kurek kuyu labirent lacivert lahana lavanta leblebi levha liman " +
    "lira lunapark madalya mahalle makas mandalina manolya marul matara mayis maymun mendil mercan " +
    "mercimek merdiven mesale mikrofon mimoza minder misina mor muhabbet mum murekkep musluk nakis nalbur " +
    "nefes nilufer nokta ofis okyanus orkide ordek palamut palmiye pancar papatya papagan parke pasaport " +
    "patates pazar pekmez pelikan pencere penguen pergel perde pinpon piyano posta pul pupa radyo raf " +
    "rakam ressam reyhan robot roman sabun saksi salep salyangoz samur saray sardalya sarmasik satranc " +
    "sayfa sazan sebze sehpa sekerleme semaver serce sevinc sihir silgi simsek sirke soba sofra sogan " +
    "sonbahar sumbul susam sut tabak tabela taksi tambur tarcin tavus tavuk tekne telefon tenis testi " +
    "tirtil tohum top topac turna turp tutku tuzluk ucurtma ufuk uskumru uzay vanilya vazo vitrin yapboz " +
    "yarasa yastik yatak yelken yelpaze yemek yengec yesil yogurt yorum yuzuk zarf zebra zemin zurna " +
    "alaca anason ardic armoni asma badem bagdat balon barinak basamak bayir benzin besik beste beyit " +
    "bezelye bilezik birlik boncuk boru bostan buhar bukle bulgur buket cagla cam cenk cetvel ciftlik " +
    "cilingir cinko cizme dalgic defile dergi direk dizi dogan dolunay dondurma dumbelek duygu ebru ekim " +
    "eksen elek emzik erzak esarp etiket fanus feribot fiskiye fosil gaga galeri garaj gazoz gecit gergef " +
    "girdap gokce guvercin halat hamur harf hasret hayalet hece hemsire hisar horoz ilkbahar irmik isaret " +
    "istakoz izci jeton kaftan kalabalik kamis kanyon karakol karyola kase katar kavanoz kaynak kehribar " +
    "kemence kirlangic kirmizi kizilcik koala kolye konfeti kosu kovan kral kristal kubbe kulube kurbaga " +
    "kusak kutu lagun lezzet logo lokanta lupa macera mahmuz makara mandal masa matkap melodi mesken " +
    "metro mihenk mimari minare mineral misafir mizan modem mola motor mucit mutfak nadide nazar nisasta " +
    "nohut nota oduncu okcu olimpiyat orkestra otobus otogar ozan paket palet pano papyon pasa pastirma " +
    "patlican pelerin pembe pergole petek pikap pipet plaj poster pudra pulsar rafting ranza resim rozet " +
    "saglik sahan salata samdan sanat sargi saz sefer seramik serinlik sesli sevgi sinema siyah sopa " +
    "sosis stat suluk sunum suskun tablo tahin taht taksim tane tapir tarih tasarim tatli tebessum tekir " +
    "temmuz tencere tepsi terlik tesbih tespih tombul topaz torba tost tulip tunel turuncu tutam ulak " +
    "umut usta uyku uzman vaha viyola yabani yamac yanak yazar yedek yeni yigit yokus yolcu yuva zafer " +
    "zaman zirve zumrut"
  ).split(" "),
  en: (
    "acorn actor album alley amber anchor angle apple apron arch arena arrow atlas attic autumn avenue " +
    "badge bagel baker balcony ball bamboo banana band banjo barn barrel basket batch beach beacon bean " +
    "bear beaver bell bench berry bicycle birch bird biscuit blanket blossom board boat bonnet book boot " +
    "bottle boulder bow bowl box branch brass bread breeze brick bridge brook broom brush bubble bucket " +
    "buckle bugle bunny button cabin cable cactus cake camel camera camp candle candy canoe canvas canyon " +
    "cape captain card carpet carrot castle cedar cello chair chalk channel charm cherry chess chimney " +
    "chorus cider cinema circle city clay cliff clock cloud clover coast cobalt cocoa coconut comet " +
    "compass cookie copper coral corner cotton cousin cove cracker crane crayon creek cricket crown " +
    "crystal cupcake curtain cushion daisy dance dawn deer delta desert diamond dinner dolphin donkey " +
    "door dragon drawer dream drum duck dune eagle easel echo elbow elm ember engine falcon feather fern " +
    "ferry fiddle field fig finch fire flag flame flute fog forest fork fossil fountain fox frost fudge " +
    "galaxy garden garlic gate gecko gem ginger giraffe glacier glove goat gold goose grape grass gravel " +
    "guitar gull hammock harbor harp hat hawk hazel heart hedge helmet heron hill hive honey horizon " +
    "horse hotel island ivory ivy jacket jam jar jasmine jazz jelly jewel journey jungle kayak kettle key " +
    "kite kitten koala ladder lagoon lake lamp lantern lark lava leaf lemon letter library lily lime " +
    "linen lion lizard llama lobster locket lodge lotus magnet mango maple marble market meadow melon " +
    "mermaid meteor mint mirror mitten moon moose moss motor mountain muffin mural music needle nest " +
    "nickel noodle north nutmeg oak oasis ocean olive onion opal orange orbit orchard otter owl oyster " +
    "paddle palace palm panda paper parade parrot pasta peach peanut pear pebble pelican pencil penguin " +
    "pepper piano picnic pigeon pillow pilot pine pizza planet plum pocket pony poppy portal potato " +
    "pottery prairie puzzle quail quartz quilt rabbit raccoon radio rain rainbow raven reef ribbon river " +
    "robin rocket roof rose ruby saddle sail salmon salt sand sapphire saturn scarf school scooter seal " +
    "season shadow shell ship silver sketch sky sled snail snow socks sofa sparrow spice spider spoon " +
    "spring squash squirrel stamp star statue stone storm stream street sugar summit sun sunset swan " +
    "sweater swing table tablet tango teapot temple tent thunder ticket tiger timber toast tomato torch " +
    "tower tractor trail train tree tulip tunnel turtle umbrella unicorn valley velvet violin volcano " +
    "wagon walnut walrus wave whale wheat whistle willow window winter wolf wombat wool yacht yarn yogurt " +
    "zebra zephyr zipper acrobat admiral almond alpine anvil apricot aquarium arcade archer armchair " +
    "aspen avocado badger ballet balloon bandana barley basil bazaar beetle beret bison blender blizzard " +
    "bluebird bobcat bongo bouquet bracelet breadbox brownie buffalo bungalow burrow butter cabbage cafe " +
    "calendar canary caramel cardinal carousel cashew catfish cavern celery chapel cheddar cheetah " +
    "chestnut chili chipmunk chocolate cinnamon citrus clarinet coaster cobble collar condor cookbook " +
    "cornet cosmos cottage cowboy coyote crater crocus croissant crow cucumber cupboard dahlia dandelion " +
    "dingo domino doodle dove dumpling elephant elf emerald emu fable fiesta firefly fjord flamingo " +
    "flannel flask flint fondue forge fresco frog gadget gallery garnet gazebo geyser glider goblet " +
    "gondola gopher gorilla granite gravy griffin grove guava gumbo hamster haystack hazelnut hedgehog " +
    "hibiscus hiker hippo holly hornet hummus husky iceberg igloo iguana inkwell jaguar jigsaw jogger " +
    "juniper kale kangaroo kernel kiwi ladle lasso lattice lemur lentil lettuce lighthouse lilac lynx " +
    "macaw mallet manatee mandolin mantle marlin marsh meerkat mesa minnow mocha monsoon mosaic mule " +
    "mustang nectar newt nomad nugget oatmeal octopus omelet orchid ostrich paprika parsley pastry " +
    "peacock pecan petal pickle pinecone pinwheel pistachio plaza polka pond popcorn porch possum pretzel " +
    "prism puffin pumpkin quokka radish raisin ranch ravioli reindeer rhino riddle rooster rosemary " +
    "rowboat saffron sage salsa sandal sardine satchel sausage scallop sequoia sesame shamrock sherbet " +
    "shrimp skylark slipper sloth smoothie sonnet spinach sprout stallion starfish sundae sunflower taco " +
    "tadpole tambour tapestry teacup thimble thistle thyme toffee topaz toucan trolley trumpet tuba " +
    "turnip tuxedo ukulele urchin vanilla veranda viking vinyl vulture waffle wallaby warbler wasabi " +
    "weasel wigwam windmill wizard woodpecker yodel yucca zinnia"
  ).split(" "),
  de: (
    "abend adler ahorn akte alpen ampel anker apfel arena atlas auge ausflug auto bach backe bahn ball " +
    "banane bank bar bart bauer baum becher beere berg besen bett beute biber biene bild birke birne " +
    "blatt blitz blume bluse boden bogen bohne boot brett brief brille brot bruecke brunnen buch buche " +
    "burg busch butter dach dackel dampf daumen decke delfin deich drache draht dorf dose drossel duene " +
    "eber ecke efeu eiche eimer eis elch ente erbse erde esche esel eule fabel fackel faden fahne falke " +
    "farbe farn fass feder fee feld fels fenster ferien fest feuer fichte film fink fisch flagge flamme " +
    "flasche fleck floete floh flosse fluss flut fohlen forelle frosch fuchs funke gabel gans garten " +
    "gasse geige gemse gerste gipfel giraffe glas glocke gold gras griff grotte gurke gurt hafen hafer " +
    "hahn hai halm hammer hand harfe hase haus hecht hecke hefe heide held helm hemd henne herbst herz " +
    "heu himmel hirsch hof hoehle holz honig horn hose huegel huhn hummel hund hut igel insel jacke " +
    "jaguar jolle kaefer kahn kakao kamel kamm kanal kanne kanu kappe karte kasse kater katze keks kelch " +
    "kerze kessel kette kiefer kirsche kiste kissen klee knopf koch koffer kohl komet kompass korb korn " +
    "kran kranz krebs kreide kreis krone kroete krug kuchen kugel kuh kupfer kurbel kutsche lachs lager " +
    "lamm lampe land laterne laub lauch leiter lerche licht linde lineal loewe loeffel luchs luft lupe " +
    "mais mantel mappe marder markt maus meer mehl meise melone messer milch minze mond moor moos moewe " +
    "muehle muschel musik muetze nadel nagel narzisse nebel nest netz nixe norden nudel nuss ofen ohr " +
    "oliv onkel orgel otter paddel palme panda papier park pfau pfeffer pfeil pferd pflaume pilz pinsel " +
    "platz pony post puder puppe quelle rabe rad rahmen rakete rasen raupe rebe regen reh reif reis ring " +
    "robbe rock rose rubin ruder sack saft salat salz sand sattel schaf schal schiff schirm schloss " +
    "schnee schuh see segel seide seil senf sessel sichel sieb silber sofa sommer sonne spaten spatz " +
    "specht spiegel spinne stab stall stern stiefel stock storch strand strauss strom stuhl sturm tafel " +
    "tal tanne tasche tasse taube tee teich teller tiger tinte tisch topf traube tuer tulpe turm uhr ulme " +
    "vase veilchen vogel vulkan waage wagen wal wald wand wasser watte weide weizen welle wiese wind " +
    "winter wolke wolle wurm zange zaun zebra zelt ziege zimmer zitrone zucker zug adresse akkordeon " +
    "amsel ananas anorak apotheke aprikose aquarell arche armband atem auster bagger balkon ballon bambus " +
    "bananen baracke basar bastei becken beet bernstein bilder blase blech bleistift blitzer bonbon " +
    "brezel bruder buerste dattel diamant domino donner duft dynamo eidechse eiland einhorn eisbaer engel " +
    "enzian erdbeere fahrrad falter fasan feige felsen fernrohr festung fiedel flieder flocke floss " +
    "fluegel foehn frucht fruehling gaukler gecko geysir glanz glimmer globus granit grille gruss hagel " +
    "halle halstuch hamster hangar harz haube hering himbeere holunder hornisse hummer ingwer jasmin " +
    "joghurt kabine kaktus kamin kapelle karotte karussell kastanie kekse keller kiesel kiwi klavier " +
    "knoten koala kobold kokos koralle kosmos krabbe kraniche kreisel kristall kuerbis kutter lagune " +
    "lakritz lasso lavendel lebkuchen libelle lilie limette locke lotse luftschiff magnet mandel marmor " +
    "matrose melodie mikado mimose mistel mosaik mostrich motor muskat nashorn nelke nougat oase obelisk " +
    "ocker orange orchidee osterei pagode palast papagei pappel paprika pegel pelikan pfanne pfirsich " +
    "pinguin pinie pistazie planet plateau polka posaune propeller pudel pumpe quarz quitte radieschen " +
    "rakel regatta reiher rentier rettich riese rodel rosine rucksack safran salbei schachtel schaukel " +
    "schlitten schnecke schwan seestern sellerie sirup skizze sonett spargel sperling spinat sprosse " +
    "stachel stempel stieglitz strudel sultan tango tapir tiara toffee tomate topas trommel trompete tuba " +
    "ufer uhu vanille veranda violine walnuss waschbaer wiesel windrad wippe wuerfel zauber zeder zikade " +
    "zimt zinn zirkus zither zwiebel"
  ).split(" "),
  es: (
    "abeja abrigo aceite aguila ala alba almendra alfombra alma amigo ancla anillo antena arbol arco " +
    "arena arroz atlas aurora avena ave avion azul bahia balcon ballena balon banco bandera barco barril " +
    "bastion baul bosque bota botella brisa buho burro caballo cabra cacao cactus cafe caja calle cama " +
    "camino campana campo canal canela cangrejo canoa capa carbon carro casa castillo cebolla cedro " +
    "cereza cesta cielo cigarra cine circo ciruela ciudad clavel cobre cocina cohete colina collar cometa " +
    "concha conejo copa coral corona cuaderno cuchara cuerda cueva delfin desierto diamante dragon duende " +
    "duna eco eclipse escoba espejo espiga estrella faro fiesta flauta flor foca fresa fruta fuego fuente " +
    "gacela galleta gallo ganso garza gato girasol globo gorra granja grillo guante guitarra halcon " +
    "harina helado hierba higo hoja hongo horno hormiga huerto huevo isla jaguar jardin jarra jirafa " +
    "juego koala lago lampara lana lapiz lechuza lemur leon libro lima limon lince lirio llama llave " +
    "lluvia lobo loro luna maceta madera maiz mango manta manzana mapa mar marea mariposa martillo melon " +
    "mesa miel mochila molino mono montana mora muela museo musica naranja nido niebla nieve noche nube " +
    "nuez oasis ocaso oceano ola oliva oro oso oveja pajaro paloma palma pan panda papel parque pato pavo " +
    "pelota pera perla perro pez piano pimienta pino pinta piedra planeta playa pluma pozo prado pueblo " +
    "puente puerta pulpo queso radio rana rayo reina reloj remo rio roble roca rosa rueda sal salmon " +
    "sandia selva semilla seta sierra silla sol sombra sombrero sopa taza tambor tejado tesoro tiburon " +
    "tigre tierra tijera tomate tormenta tortuga tren trigo trueno tulipan uva vaca vela venado ventana " +
    "verano viento violin volcan yate yegua yoyo zanahoria zapato zorro abanico acuarela aguacate ajedrez " +
    "alcazar alerce algodon almohada amapola ananas anchoa anguila arandano arbusto ardilla arpa arroyo " +
    "atun avellana azafran azucar bambu barquillo bastidor batido baya bellota berenjena bisonte bizcocho " +
    "bodega bombilla bufanda burbuja cabana cadena calabaza calamar caleta camello canario cancion " +
    "candado canguro capitan caracol caramelo carpa carrusel castana cebra cenote cereal cerezo chaleco " +
    "chocolate cisne clarinete cobija colibri columpio comarca condor corcho cordero corneta cuarzo " +
    "cupula churro dalia dinamo domino durazno edredon elefante esmeralda espiral estanque estufa faisan " +
    "farol fideo flamenco fogata fosil frambuesa frijol gaviota geranio glaciar golondrina gorila granada " +
    "grulla guijarro guisante hamaca hamster helecho hiedra hipopotamo hormigon huracan iglu iguana " +
    "jazmin jengibre jilguero kiwi laguna langosta lavanda lechuga lenteja libelula linterna lobato " +
    "luciernaga magnolia mandarina manantial mandolina marmol mascara medusa mejillon melocoton mermelada " +
    "meseta mimosa mirlo mosaico murcielago nectar nenufar nogal nutria orca orquidea ostra pala palacio " +
    "panal pantera papaya paraguas pasto patineta pecera pelicano pepino perdiz pergola pinguino pinon " +
    "pistacho plaza pomelo poncho puma quinoa rabano rastrillo regalo reno rubi salvia sardina sauce " +
    "sirena sonaja tapiz tejon telar tomillo topacio toronja trebol trompeta tucan turron unicornio " +
    "vainilla valle veleta verbena yeso zafiro zarzamora abuelo acera adobe agenda aldea alfiler almeja " +
    "altar ambar arcilla artista asiento aspa avestruz balsa bambalina banjo barniz bateria baton bigote " +
    "bisagra bodegon bolero bolsillo bombo borrego brujula buzon cacto cajon calcetin caliz camara camisa " +
    "campera canasta candil canica cantaro capullo carbonero cardo carpintero cartero cazo cepillo " +
    "cerrojo cofre cojin compas copo cordillera corral cortina cuadro cubo cumbre dardo dedal delantal " +
    "disco dulce embudo enano erizo escudo esponja establo estatua fanal fieltro flecha forja fragua " +
    "gorrion granito guijo herradura hilo horizonte jabon jarron jinete junco ladrillo lazo lienzo lucero " +
    "mantel marfil marinero mastil mecedora mimbre mirador molde mostaza nave ovillo pajarita panadero " +
    "paraiso pastel peineta pendiente pergamino pincel piragua pizarra polvo potro quesadilla ranura " +
    "rebano remolino rincon saco sandalia sarten silbato tablero tinaja tintero toldo trompo turquesa " +
    "vaso velero vitral yunque"
  ).split(" "),
  fr: (
    "abeille abricot acajou aigle aiguille algue amande ananas ancre ange anneau arbre arc ardoise argent " +
    "arrosoir atlas aube autruche avion avoine badge bague baie baleine balcon ballon bambou banane banc " +
    "bateau baton bijou biscuit blaireau bleuet bocal bois bonnet bougie bouleau bouquet boussole " +
    "bouteille branche brebis brioche brise brume buffle bulle bureau cabane cacao cactus cadeau cahier " +
    "caillou camion canard canne canot caramel carotte carte castor cerf cerise chaise chalet chameau " +
    "champ chapeau chat chateau chemin chene cheval chevre chocolat cigale cigogne citron citrouille " +
    "clairon clef cloche clou cochon coffre colline comete concert coquille corail corbeau cornet coton " +
    "coussin crabe craie crayon croissant cygne dauphin desert diamant dindon domino donjon dragon dune " +
    "eclair ecureuil eglise elan epice epine escargot etoile faucon fenetre ferme feuille figue flamme " +
    "fleur flute foret fontaine fourmi fraise framboise frene fromage fusee galet gant gateau gazelle " +
    "girafe glace gland globe gorille goutte grain grenade grenouille grillon guitare hamac hameau harpe " +
    "herbe heron hibou hirondelle homard horloge houx huitre ile iris jardin jasmin jonquille journal " +
    "jungle kiwi lac lampe lapin lavande lezard licorne lierre lilas lime lion livre loup loutre lune " +
    "lynx maison mangue manteau marbre marche marmotte melon merle miel miroir moineau montagne moulin " +
    "mouette mouton muguet mur musique navire neige nid noisette noix nuage oasis ocean olive oiseau " +
    "orange orage orchidee ours panda papillon parapluie pastel pecheur pelican pendule perle phare piano " +
    "pigeon pin pinceau plage planete plume poire pomme pont potiron poule prairie prune puits pyramide " +
    "radis raisin renard requin riviere robe rocher rose rossignol roue rubis ruisseau sable sabot sapin " +
    "saphir sardine saumon sel singe soleil source sucre tambour tapis tasse taureau tigre tilleul tomate " +
    "tortue toupie train trefle tresor trompette tulipe vache vague vallee vanille velo vent verger " +
    "violon volcan voile yaourt zebre abeilles accordeon aimant albatros alouette amiral ampoule anis " +
    "antilope aquarelle araignee arbuste armoire artichaut asperge aurore autobus avocat baguette balade " +
    "balai banquise baobab baril basilic bassin bec belier berceau beret betterave bison bivouac bleu " +
    "bobine bocage bonbon bouee boulanger bourgeon bouton brindille buisson cactee calepin camelia canari " +
    "cannelle capitaine caravane cartable cascade casquette cedre cerceau cerfeuil chalumeau chameleon " +
    "champignon chandelle chardon chaton chenille chiot cidre citadelle clementine coccinelle colibri " +
    "comptoir concombre condor corbeille corsaire courgette cravate crevette criquet cristal cuillere " +
    "cumin dahlia dentelle diabolo dirigeable echarpe ecorce edelweiss encre epinard erable escalier " +
    "etang eventail falaise faisan fanfare farine fauteuil fenouil flamant flocon fougere fourchette " +
    "fresque fusain galaxie gaufre gecko genet geyser girouette glacier glycine gondole goeland gourde " +
    "grange griffon grotte guepe guimauve haricot hermine hippocampe houblon igloo jaguar jambon jockey " +
    "jongleur kangourou kayak lagune lampion lanterne laurier lentille libellule limace loupe luciole " +
    "madeleine magnolia mandarine mandoline marron mascotte medaille menthe meringue mesange mimosa " +
    "mirabelle moustique muscade myrtille nectar noisetier nougat oursin palmier panier paon papaye " +
    "parasol pastille patin pavot pelouse perroquet persil petale pistache plateau poivre pompon praline " +
    "puffin quartz radeau ramier ravioli reglisse renne roseau ruche safran salade sauterelle sirop " +
    "sorbet souris spatule tabouret tambourin tanneur tartine theiere thym toucan tournesol tuba vapeur " +
    "veranda violette yacht zinnia abri agneau allumette amphore anse arcade atelier auberge avenue " +
    "bambin barque bassine bermuda bidon billet biche bouclier bouilloire boulier bourdon brouette " +
    "bruyere cadran calice canape canevas capuche carafe carillon carrousel casque castagne chaloupe " +
    "chapelle chariot chaudron cheminee cible cloison clocher clown colombe comptine corde corniche " +
    "coupole crepe crochet cymbale desserte domaine eau ecluse emeraude encrier enclume escale etable " +
    "etoffe etui facteur fanion fil flacon fleuve forge fosse fouet fourneau galette garde gilet gobelet " +
    "grelot guirlande hublot jarre jeton jupe kiosque lacet lampadaire lingot luge malle marelle marmite " +
    "marteau masque mat menhir meule mitaine mortier mosaique navette nougatine obole ombrelle ondee orme " +
    "osier palette panache parchemin passerelle patine pelle perchoir pilier pion plaid plumeau pochette " +
    "poterie poulie quai rame rateau ruban sablier sacoche selle semaine serrure sifflet sonnette tablier " +
    "tamis theatre timbre tonneau tuile vase vitrail"
  ).split(" "),
  "pt-BR": (
    "abacate abacaxi abelha abobora abraco acai agua aguia alce alecrim alface algodao alho alma ameixa " +
    "amendoa amigo amora anel anjo antena anzol arara areia arroz asa atlas aurora avestruz azeite azul " +
    "bacia baleia balao balde bambu banana banco bandeira barco barro bateria bau beija bengala besouro " +
    "bicho bigode bijuteria biscoito boia bola bolo bolsa bombom boneca borboleta bosque bota brisa bule " +
    "buriti burro cabana cabra cacau cacto cadeira cafe caixa caju calango cama camelo caminho campo " +
    "canal canela caneta canoa capim capivara caracol caramelo carneiro carta casa castelo cavalo cebola " +
    "cedro cenoura cereja chave chuva cidade cinema circo cisne cobra coco coelho cofre colher colina " +
    "cometa concha coral corda coruja couve cravo cuia danca dado dente deserto diamante doce dragao duna " +
    "eco escada escola espelho estrela farol fazenda feijao fita flauta flor floresta fogo foguete folha " +
    "formiga fruta fumaca gaivota galo garfo garrafa gato gaveta gelo girafa girassol goiaba golfinho " +
    "gorila grama guarana guitarra horta hortela ilha ipe jabuti jacare jambo janela jardim jarra jasmim " +
    "jiboia joia lago lagoa lagosta laranja lareira leao leite lenco limao lince lirio livro lobo lontra " +
    "lua macaco maca madeira mala mamao manga mapa mar marfim mato mel melancia mesa milho mochila moeda " +
    "montanha morango mosaico museu musica navio neve ninho noite nuvem oceano ombro onda onca orquidea " +
    "ouro ovelha pacoca palmeira panda papagaio papel parque pato pavao peixe pena pente pera perola " +
    "peteca piano pimenta pinguim pinheiro pipa planeta praia prato quadro queijo raposa relogio remo rio " +
    "rosa roda sabia sabao sal salsa sapato sapo selva semente serra sino sol sombra sorvete tamanco " +
    "tambor tartaruga tatu teatro telhado tesoura tesouro tigre tijolo tomate trem trigo tucano uva vaca " +
    "vale vela vento violao violino vulcao xadrez zebra abacateiro agulha alcachofra aldeia alpaca ancora " +
    "andorinha anta apito aquarela araucaria arco armario arvore assobio aveia avental azaleia azulejo " +
    "bacalhau baiao balanco banquete barbante barraca batata baton beterraba bicicleta biju bloco bocha " +
    "bode boiada bombacha bonde boto brigadeiro broa bromelia brocolis buzio cacatua cachoeira cajueiro " +
    "calda caldeirao caminhao canario canjica capacete capitao caravela carimbo carrossel cascata " +
    "castanha cataplana catavento cavaco cerrado chafariz chaleira chapeu charrete chimarrao chocalho " +
    "cigarra cipo clarinete coentro colmeia corneta coroa cotia cuscuz damasco dendezeiro dobradura " +
    "dominio dourado ervilha escova esmeralda espiga esquilo estojo farofa faisca feira ferradura figo " +
    "fivela flamingo forro framboesa frevo fuba gangorra garoupa gazela gengibre gerbera goiabada granito " +
    "graviola grilo guaxinim harpa hibisco iate iguana jaboticaba jaca jangada jarina jequitiba joaninha " +
    "juta lagarta lampiao lanterna laranjeira lavanda lebre lentilha libelula lilas linho lustre " +
    "macaxeira magnolia mandacaru mandioca maracuja margarida marimba mariposa marmelo martelo medalha " +
    "melodia mexerica mico mirante moqueca morcego mostarda mutirao nabo nectar nogueira oasis orvalho " +
    "ostra paca palito panela pandeiro papaia paraquedas pastel pavio pedal peneira pepino periquito " +
    "pessego peteleco picole pinha pitanga pomar pombo potro pudim pulseira quati quindim rabanete " +
    "rapadura regata rede reboque roseira sabiazinho sanfona sardinha saveiro seriema siri sorriso sucuri " +
    "tamarindo tapete tapioca tear teiu tijuca tipiti toalha trevo trombone tulipa urso urubu varal " +
    "veleiro vitoria xicara acude alameda albatroz alfinete almofada amuleto arame argila arpoador atalho " +
    "atum avenida azeitona baia bailarina bambolina barbatana baronesa bastao batuque bauzinho beco " +
    "berimbau bilhete binoculo boina bolacha bonsai borracha botao buque cabide cachecol cadeado caderno " +
    "caiaque calendario camelia campainha caneca canteiro capuz carambola caravana cartola casaco " +
    "cascalho cata cebolinha chinelo chocolate ciranda colar coqueiro cordel corrente cortina cristal " +
    "cupula dedal degrau diario disco duende enxada envelope escudo esponja estrada estrelado farinha " +
    "ferro festa fogao fonte forno fragata funil gaita galope garoa geleia gibao globo gruta guarda iglu " +
    "imbuia janta jornal lanche lapis laco leque linha lousa luva luneta maestro malha manto mapinha " +
    "marinheiro mascara mastro meia mola moinho muralha novelo oficina orla padaria palco paleta panfleto " +
    "papiro passarinho pastor patins pedra penca picada pincel pipoca piscina planta poncho porta potinho " +
    "prancha quintal radio ramo ranhura recife retrato roca rolha saia saquinho selo seresta sininho " +
    "sobrado sofa tabua taca tambo tampa tenda tijela trilha tronco vaso vereda vitral"
  ).split(" "),
  ru: (
    "arbuz aist akula almaz angel apelsin arfa babochka bagul balkon banan baran barabay belka bereza " +
    "bereg bisquit blin bochka bukva bulka buran burya chainik chashka chaika cherepakha chernika dacha " +
    "delfin derevo dolina dom doroga drakon drova duga dub dym ezhik fakel feya fialka fonar fontan forel " +
    "gavan glina gnezdo gora gorod gorokh granat greben grib grom gruzd gus iskra izba kabachok kalina " +
    "kamen kanat kapusta karta kashtan kedr klen klubok klyuch knopka kolokol koltso komar kometa konfeta " +
    "kon korabl korona kosa kot kran krolik kruzhka kukla kupol lampa lastochka lebed led lepestok les " +
    "lesa limon lipa lisa listok lodka lozhka luna luk luzha malina mayak med medved mel metel mishka mol " +
    "monetka more morkov most moroz muravey myach mys nebo nora noch oblako ogon ogurets okean olen oreh " +
    "orel ostrov ozero palatka paporotnik parus pech pero pesok pirog plyazh podkova pole polyana porog " +
    "prud ptitsa radio raduga rakushka reka repa roza rucheek ryba sad sani sapog sever sinitsa skala " +
    "sliva slon sneg sobaka sokol solnce sosna sova stol sunduk svecha syr tikva tigr tropa tucha tulpan " +
    "tyulen ugol utka vagon valenki vaza veter vishnya voda volk volna vorobey yabloko yagoda yakor " +
    "yashma yolka zaika zamok zarya zemlya zerno zhuk zima zmey zvezda abrikos akvarel albom alleya " +
    "ananas antilopa arka astra avtobus baton bant baraban barsuk batut berlog beseda bidon biser bobr " +
    "bokal bubenchik bublik bumaga buton chasy chereshnya chizh dirizhabl domino dozhd dyatel ekran elka " +
    "fasol festival figura flag flazhok fregat galka garmon gitara globus golub gorka gorshok gramota " +
    "gusli imbir indyuk iris izyum kaktus kalach kamysh karandash karusel kaska kaskad katok kayak " +
    "kedrovka kefir kilt kisel kist kit kiwi klever kobra kolibri kompas korzina kosmos kostyor kovyor " +
    "kozha kruzhevo kryzhovnik kuznechik lagun lavanda lebeda lenta lev limonad lisichka loshad lukoshko " +
    "marka matryoshka melodiya miska mozaika mukha nalim nosorog obezyana odeyalo okun olivka orkestr " +
    "palma panda pantera papka pastila pavlin pelikan perets persik pingvin pion planeta plot pomidor " +
    "popugay poyas pryanik pshenitsa puh pyramida raketa rozmarin rubin rukav salyut samovar samolyot " +
    "sarafan sazan semya serebro shapka shar shashki shishka shkatulka shmel skazka skripka skvorets " +
    "slivki snegir sobol solovey sorochka sputnik stakan stolb strekoza strizh sukhar sviter sych tarelka " +
    "teatr telega topaz topol tramvay trava truba tsvetok tyulpan udochka uzor valun varene vatrushka " +
    "venok verblyud veslo vesna vilka vinograd voron yaschik yurta zabor zebra zhemchug zontik avos " +
    "azbuka bagaj bakhcha balalaika bananka bank barhan bashnya bivak blokhnot bocharka bor borsch brevno " +
    "broshka buben buket bulavka burav chabrets chaynaya chulan cyrk dvor dzhem enot gamak garazh gavot " +
    "gazeta gnom gorizont gornitsa granit gril gryadka gvozd ikra ilm iva izumrud kabina kadka kalitka " +
    "kamelek kapel kapitan karavay karp kater kaviar kipar kladovaya kletka klumba kolodets kolos kompot " +
    "kopna korka krasa krepost krinka krug krysha kuvshin kuznitsa lad laguna lampada laska lavka lednik " +
    "lestnitsa liana lodochka luch lug lyzhi mak malyar mantiya margaritka marshrut maslo mast mayka " +
    "melnitsa mesyats metla mukhomor muzey myata nasos nevod obruch ochag ograda okno orbita oreshnik " +
    "otmel ozimye palitra parom pastukh pechka peron pesnya pirozhok pitomnik plashch plitka polka " +
    "portfel posoh pristan probka prospekt pruzhina pugovitsa rakita rama remen rog rosa rozhok ruchka " +
    "rynok sabantuy sapfir sena shalash shatyor shkaf shlyapa shtora shuba skameyka sklon slovo snezhok " +
    "sopka steklo stog stroka sugrob sumka svitok tachka tarantas terem tesma tkan toporik tulup tuman " +
    "tykva ulitsa ulitka uyut varezhka vedro vereten vetka vitrina vodopad volan vyshivka yablonya " +
    "yamshchik yashchik zagadka zamochek zavod zayats zelen zerkalo zvon"
  ).split(" "),
};
